"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="p-8 text-center">
    <h1>活动暂时无法加载 / Events temporarily unavailable</h1>
    <p>请稍后重试。Please try again shortly.</p>
    <button className="mt-4 rounded border px-4 py-2" onClick={reset}>重试 / Retry</button>
  </main>;
}
