import { useState } from "react";
import type { AdminUser } from "../../api/types";
import { Button, Dialog, Field, Input } from "../ui";
import { EMAIL_RE, type PatchBody } from "./shared";

/** 绑定邮箱弹窗：留空保存 = 解绑（Access 首登按绑定邮箱锚定存量账号） */
export function EmailDialog({
  user,
  busy,
  onClose,
  onSubmit,
}: {
  user: AdminUser;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: PatchBody) => void;
}) {
  const [val, setVal] = useState(user.email ?? "");
  const trimmed = val.trim();
  const valid = trimmed === "" || EMAIL_RE.test(trimmed);
  return (
    <Dialog
      open
      onClose={onClose}
      title={`绑定邮箱 · ${user.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button disabled={!valid || busy} onClick={() => onSubmit({ email: trimmed === "" ? null : trimmed })}>
            保存
          </Button>
        </>
      }
    >
      <Field
        label="绑定邮箱"
        hint="留空保存 = 解绑；Cloudflare Access 首登按绑定邮箱锚定存量账号"
        error={!valid ? "邮箱格式不正确" : undefined}
      >
        <Input type="email" value={val} placeholder="name@example.com" onChange={(e) => setVal(e.target.value)} autoFocus />
      </Field>
    </Dialog>
  );
}
