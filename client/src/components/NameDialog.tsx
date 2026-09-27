import { useEffect, useRef, useState } from "react";
import { Button, Dialog, Input } from "./ui";

interface Props {
  title: string;
  initial?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
  busy?: boolean;
}

export default function NameDialog({ title, initial = "", onSubmit, onCancel, busy }: Props) {
  const [name, setName] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.select(), []);
  return (
    <Dialog
      open
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>取消</Button>
          <Button disabled={!name.trim() || busy} onClick={() => onSubmit(name.trim())}>确定</Button>
        </>
      }
    >
      <Input
        ref={ref}
        aria-label="名称"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && name.trim() && onSubmit(name.trim())}
        autoFocus
      />
    </Dialog>
  );
}
