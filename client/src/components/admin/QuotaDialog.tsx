import { useState } from "react";
import type { AdminUser } from "../../api/types";
import { Button, Dialog, Field, Input } from "../ui";
import { GB, quotaGb, type PatchBody } from "./shared";

/** 配额弹窗：校验「大于 0 的整数 GB」，提交后由上层 invalidate ["admin-users"] */
export function QuotaDialog({
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
  const [val, setVal] = useState(user.quota_bytes == null ? "" : String(quotaGb(user.quota_bytes)));
  const gb = Number(val);
  const valid = Number.isInteger(gb) && gb > 0;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`编辑配额 · ${user.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button disabled={!valid || busy} onClick={() => onSubmit({ quota_bytes: gb * GB })}>
            保存
          </Button>
        </>
      }
    >
      <Field label="配额（GB）" hint="大于 0 的整数；保存后立即生效" error={!valid ? "须为大于 0 的整数" : undefined}>
        <Input type="number" min="1" step="1" inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} autoFocus />
      </Field>
    </Dialog>
  );
}
