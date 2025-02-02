"use client"

import { useCallback, useRef, useState, useTransition } from "react"
import {
  TAnyZodSafeFunctionHandler,
  ZSAError,
  inferServerActionReturnData,
  inferServerActionReturnType,
} from "zsa"
import { TServerActionResult } from "./results.js"

const getEmptyResult = () => ({
  isError: false,
  error: undefined,
  data: undefined,
})

const getEmptyOldResult = () =>
  ({
    status: "empty",
    result: undefined,
  }) as const

export const useServerAction = <
  const TServerAction extends TAnyZodSafeFunctionHandler,
>(
  serverAction: TServerAction,
  opts?: {
    onError?: (args: { err: ZSAError }) => void
    onSuccess?: (args: { data: Awaited<ReturnType<TServerAction>>[0] }) => void
    onStart?: () => void

    initialData?: inferServerActionReturnData<TServerAction>

    retry?: {
      maxAttempts: number
      delay?: number | ((currentAttempt: number, err: ZSAError) => number)
    }
  }
) => {
  type TResult = {
    isError: boolean
    error: undefined | unknown
    data: undefined | inferServerActionReturnData<TServerAction>
  }

  type TOldResult =
    | {
        status: "empty"
        result: undefined
      }
    | {
        status: "filled"
        result: TResult
      }

  const initialData = opts?.initialData

  const [, startTransition] = useTransition()
  const [result, setResult] = useState<TResult>(
    !initialData
      ? getEmptyResult()
      : {
          isError: false,
          error: undefined,
          data: initialData,
        }
  )
  const [oldResult, setOldResult] = useState<TOldResult>(getEmptyOldResult())
  const [isExecuting, setIsExecuting] = useState(false)
  const lastRetryId = useRef(0)
  const retryCount = useRef(0)

  const internalExecute = useCallback(
    async (
      input: Parameters<TServerAction>[0],
      args?: {
        isFromRetryId?: number
      }
    ): Promise<inferServerActionReturnType<TServerAction>> => {
      const { isFromRetryId } = args || {}

      // if the retry ids don't match, we should not refetch
      if (isFromRetryId && lastRetryId.current !== isFromRetryId) {
        return null as any
      }

      // start a new retry count
      if (!isFromRetryId) {
        retryCount.current = 0
      }

      // start a new retry id
      const retryId = Math.floor(Math.random() * 10000)
      lastRetryId.current = retryId

      if (opts?.onStart) opts.onStart()

      setIsExecuting(true)

      const [data, err] = await serverAction(input)

      if (err) {
        if (opts?.onError) {
          opts.onError({
            err,
          })
        }

        setIsExecuting(false)

        // calculate if we should retry
        const retryConfig = opts?.retry
        const shouldRetry = retryConfig
          ? retryCount.current < retryConfig.maxAttempts
          : false

        let retryDelay = 0
        const retryDelayOpt = retryConfig?.delay
        if (retryDelayOpt && typeof retryDelayOpt === "function") {
          retryDelay = retryDelayOpt(retryCount.current + 1, err)
        } else if (retryDelayOpt && typeof retryDelayOpt === "number") {
          retryDelay = retryDelayOpt
        }

        if (shouldRetry) {
          // execute the retry logic
          retryCount.current += 1
          setTimeout(() => {
            internalExecute(input, {
              ...(args || {}),
              isFromRetryId: retryId,
            })
          }, retryDelay)
        } else {
          // don't retry => update the result
          if (oldResult.status === "filled") {
            setResult(oldResult.result)
          } else {
            setResult({ error: err, isError: true, data: undefined })
          }

          // clear the old data
          setOldResult({
            status: "empty",
            result: undefined,
          })
        }

        return [data, err] as any
      }

      if (opts?.onSuccess) {
        opts.onSuccess({
          data,
        })
      }

      setResult({
        isError: false,
        error: undefined,
        data: data ?? undefined,
      })
      setIsExecuting(false)

      // clear the old data
      setOldResult({
        status: "empty",
        result: undefined,
      })

      return [data, err] as any
    },
    [serverAction]
  )

  const execute = useCallback(
    async (input: Parameters<TServerAction>[0]) => {
      return await internalExecute(input)
    },
    [internalExecute]
  )

  const setOptimistic = useCallback(
    async (
      fn:
        | ((
            current: typeof result.data
          ) => NonNullable<Awaited<ReturnType<TServerAction>>[0]>)
        | NonNullable<Awaited<ReturnType<TServerAction>>[0]>
    ) => {
      function isFunction(value: any): value is Function {
        return typeof value === "function"
      }
      const data = isFunction(fn)
        ? fn(oldResult.status === "empty" ? result.data : oldResult.result.data)
        : fn

      if (oldResult.status === "empty") {
        setOldResult({
          status: "filled",
          result: { ...result },
        })
      }

      setResult({
        isError: false,
        error: undefined,
        data: data ?? undefined,
      })
    },
    [execute]
  )

  const reset = useCallback(() => {
    setResult(getEmptyResult())
    setOldResult(getEmptyOldResult())
    setIsExecuting(false)
    lastRetryId.current = 0
    retryCount.current = 0
  }, [])

  let final: TServerActionResult<TServerAction>

  if (isExecuting && oldResult.status === "empty") {
    final = {
      isPending: true,
      isOptimistic: false,
      data: undefined,
      isError: false,
      error: undefined,
      isSuccess: false,
      status: "pending",
    }
  } else if (isExecuting && oldResult.status === "filled" && result.data) {
    final = {
      isPending: true,
      isOptimistic: true,
      data: result.data,
      isError: false,
      error: undefined,
      isSuccess: false,
      status: "pending",
    }
  } else if (!result.isError && result.data) {
    // success state
    final = {
      isPending: false,
      isOptimistic: false,
      data: result.data,
      isError: false,
      error: undefined,
      isSuccess: true,
      status: "success",
    }
  } else if (result.isError) {
    // error state
    final = {
      isPending: false,
      data: undefined,
      isError: true,
      error: result.error,
      isOptimistic: false,
      isSuccess: false,
      status: "error",
    }
  } else {
    // idle state
    final = {
      isPending: false,
      data: undefined,
      isOptimistic: false,
      isError: false,
      error: undefined,
      isSuccess: false,
      status: "idle",
    }
  }

  return {
    ...final,
    reset,
    execute,
    setOptimistic,
  }
}
