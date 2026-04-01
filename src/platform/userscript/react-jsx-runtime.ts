import React from "./react-global"

type JsxProps = Record<string, unknown> | null | undefined

function withKey(props: JsxProps, key: string | number | undefined) {
  if (key === undefined) {
    return props ?? {}
  }

  return {
    ...(props ?? {}),
    key,
  }
}

export const Fragment = React.Fragment
export const jsx = (type: unknown, props: JsxProps, key?: string) =>
  React.createElement(type as never, withKey(props, key) as never)
export const jsxs = jsx
export default {
  Fragment,
  jsx,
  jsxs,
}
