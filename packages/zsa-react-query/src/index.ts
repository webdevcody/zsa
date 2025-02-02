"use client"

import {
  DefinedUseInfiniteQueryResult,
  DefinedUseQueryResult,
  GetNextPageParamFunction,
  InfiniteData,
  UseInfiniteQueryResult,
  UseQueryResult,
} from "@tanstack/react-query"
import {
  TAnyZodSafeFunctionHandler,
  ZSAError,
  inferServerActionInput,
  inferServerActionReturnData,
  inferServerActionReturnType,
} from "zsa"

type ServerActionsKeyFactory<TKey extends string[]> = {
  [key: string]: (...args: any[]) => TKey
}

type ServerActionKeys<TFactory extends ServerActionsKeyFactory<string[]>> =
  ReturnType<TFactory[keyof TFactory]>

export const createServerActionsKeyFactory = <
  const TKeys extends string[],
  const TFactory extends ServerActionsKeyFactory<TKeys>,
>(
  factory: TFactory
) => {
  return factory
}

export const setupServerActionHooks = <
  const TFactory extends
    | Readonly<ServerActionsKeyFactory<string[]>>
    | undefined,
>(args: {
  hooks: {
    useQuery: typeof import("@tanstack/react-query").useQuery
    useMutation: typeof import("@tanstack/react-query").useMutation
    useInfiniteQuery: typeof import("@tanstack/react-query").useInfiniteQuery
  }
  queryKeyFactory?: TFactory
}) => {
  const { useQuery, useMutation, useInfiniteQuery } = args.hooks

  type TQueryKey = TFactory extends undefined
    ? Readonly<unknown[]>
    : Readonly<ServerActionKeys<Exclude<TFactory, undefined>>>

  const useServerActionInfiniteQuery = <
    TPageParam extends unknown,
    THandler extends TAnyZodSafeFunctionHandler,
    TInitialData extends
      | undefined
      | inferServerActionReturnData<THandler>
      | (() => inferServerActionReturnData<THandler>),
  >(
    action: THandler,
    options: Omit<
      Parameters<
        typeof useInfiniteQuery<
          inferServerActionReturnData<THandler>,
          ZSAError,
          InfiniteData<inferServerActionReturnData<THandler>>,
          TQueryKey,
          TPageParam
        >
      >[0],
      "getNextPageParam" | "initialData"
    > & {
      input: (args: {
        pageParam: TPageParam
      }) => inferServerActionInput<THandler>
      getNextPageParam: GetNextPageParamFunction<
        TPageParam,
        inferServerActionReturnData<THandler>
      >
      initialData?: TInitialData
    },
    queryClient?: Parameters<typeof useInfiniteQuery>[1]
  ): TInitialData extends undefined
    ? UseInfiniteQueryResult<inferServerActionReturnData<THandler>, ZSAError>
    : DefinedUseInfiniteQueryResult<
        inferServerActionReturnData<THandler>,
        ZSAError
      > => {
    return useInfiniteQuery(
      {
        ...options,
        queryFn: async ({ pageParam }) => {
          const input = options.input({ pageParam: pageParam as TPageParam })
          const [data, err] = await action(input)

          if (err) {
            throw err
          }

          return data
        },
      },
      queryClient
    ) as any
  }

  const useServerActionQuery = <
    THandler extends TAnyZodSafeFunctionHandler,
    TInitialData extends
      | undefined
      | inferServerActionReturnData<THandler>
      | (() => inferServerActionReturnData<THandler>),
  >(
    action: THandler,
    options: Omit<
      Parameters<
        typeof useQuery<
          inferServerActionReturnData<THandler>,
          ZSAError,
          inferServerActionReturnData<THandler>,
          TQueryKey
        >
      >[0],
      "queryFn" | "initialData"
    > & {
      input: inferServerActionInput<THandler>
      initialData?: TInitialData
    },
    queryClient?: Parameters<typeof useQuery>[1]
  ): TInitialData extends undefined
    ? UseQueryResult<inferServerActionReturnData<THandler>, ZSAError>
    : DefinedUseQueryResult<
        inferServerActionReturnData<THandler>,
        ZSAError
      > => {
    return useQuery(
      {
        ...options,
        queryFn: async () => {
          const [data, err] = await action(options.input)

          if (err) {
            throw err
          }

          return data
        },
      },
      queryClient
    ) as any
  }

  type TUseMutation<
    THandler extends TAnyZodSafeFunctionHandler,
    TNeverThrow extends boolean = false,
  > = typeof useMutation<
    TNeverThrow extends false
      ? inferServerActionReturnData<THandler>
      : inferServerActionReturnType<THandler>,
    ZSAError,
    inferServerActionInput<THandler>
  >

  const useServerActionMutation = <
    THandler extends TAnyZodSafeFunctionHandler,
    TReturnError extends boolean = false,
  >(
    action: THandler,
    options?: Omit<
      Parameters<TUseMutation<THandler, TReturnError>>[0],
      "mutationFn"
    > & {
      returnError?: TReturnError
    },
    queryClient?: Parameters<typeof useMutation>[1]
  ): ReturnType<TUseMutation<THandler, TReturnError>> => {
    return useMutation(
      {
        ...options,
        mutationFn: async (...args) => {
          const [data, err] = await action(...args)

          if (options?.returnError) {
            return [data, err]
          }

          if (err) {
            throw err
          }

          return data
        },
      },
      queryClient
    ) as any
  }

  return {
    useServerActionInfiniteQuery,
    useServerActionQuery,
    useServerActionMutation,
  }
}
