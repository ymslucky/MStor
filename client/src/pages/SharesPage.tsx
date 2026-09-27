import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listShares, revokeShare } from "../api/shares";
import { formatBytes, formatDate } from "../lib/format";

export default function SharesPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["shares"], queryFn: listShares });
  const revoke = useMutation({ mutationFn: (id: string) => revokeShare(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shares"] }) });

  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold">我的分享</h1>
      {!query.data?.shares.length && <div className="py-16 text-center text-sm text-slate-400">暂无分享</div>}
      <table className="w-full text-sm">
        <tbody>
          {query.data?.shares.map((s) => (
            <tr key={s.id} className="border-b">
              <td className="py-2">
                <div className="font-medium">{s.node_is_dir ? "📁" : "📄"} {s.node_name}</div>
                <div className="text-xs text-slate-400">/s/{s.token}</div>
              </td>
              <td className="hidden py-2 text-xs text-slate-500 sm:table-cell">
                {s.node_is_dir ? "文件夹" : formatBytes(s.node_size)}
                {" · "}已下载 {s.downloads} 次
                {s.expires_at ? ` · 有效期至 ${formatDate(s.expires_at)}` : " · 永久"}
              </td>
              <td className="py-2 text-right">
                <a href={`/s/${s.token}`} className="mr-3 text-blue-600 hover:underline" target="_blank" rel="noreferrer">
                  打开
                </a>
                <button
                  className="text-red-600 hover:underline"
                  onClick={() => window.confirm(`撤销「${s.node_name}」的分享？`) && revoke.mutate(s.id)}
                >
                  撤销
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
