/** 命中片段高亮：只包一层 mark，不改变外层文本（测试按全文匹配元素） */
export function Highlight({ text, query }: { text: string; query: string }) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-primary-soft px-0.5 text-primary-text">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}
