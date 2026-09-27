import { AwsClient } from "aws4fetch";
import type { Env } from "../env";

export function s3Client(env: Env): AwsClient {
  return new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, service: "s3" });
}

export async function createMultipart(env: Env, key: string): Promise<string> {
  const res = await fetch(await s3Client(env).sign(new Request(`${env.R2_ENDPOINT}/${key}?uploads`, { method: "POST" })));
  if (!res.ok) throw new Error(`CreateMultipartUpload failed: ${await res.text()}`);
  const xml = await res.text();
  const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(xml)?.[1];
  if (!uploadId) throw new Error("no UploadId in response");
  return uploadId;
}

export async function presignPart(env: Env, key: string, uploadId: string, partNumber: number): Promise<string> {
  const signed = await s3Client(env).sign(
    new Request(`${env.R2_ENDPOINT}/${key}?partNumber=${partNumber}&uploadId=${encodeURIComponent(uploadId)}`, { method: "PUT" }),
    { aws: { signQuery: true } },
  );
  return signed.url;
}

export async function completeMultipart(env: Env, key: string, uploadId: string, parts: { partNumber: number; etag: string }[]): Promise<void> {
  const body = `<CompleteMultipartUpload>${parts
    .map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`)
    .join("")}</CompleteMultipartUpload>`;
  const res = await fetch(
    await s3Client(env).sign(new Request(`${env.R2_ENDPOINT}/${key}?uploadId=${encodeURIComponent(uploadId)}`, {
      method: "POST", body, headers: { "content-type": "application/xml" },
    })),
  );
  if (!res.ok) throw new Error(`CompleteMultipartUpload failed: ${await res.text()}`);
}

// 尽力而为：不检查响应状态（网络抖动时也不阻塞客户端清理流程）
export async function abortMultipart(env: Env, key: string, uploadId: string): Promise<void> {
  await fetch(await s3Client(env).sign(new Request(`${env.R2_ENDPOINT}/${key}?uploadId=${encodeURIComponent(uploadId)}`, { method: "DELETE" })));
}
