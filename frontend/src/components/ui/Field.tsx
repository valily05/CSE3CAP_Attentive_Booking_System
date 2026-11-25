import { useId, type InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string };

/** A labelled input. The hint is a description, not part of the name. */
export function Field({ label, hint, ...input }: Props) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}{input.required && <span className="required-marker" aria-hidden="true"> *</span>}</label>
      <input id={id} aria-label={label} aria-describedby={hint ? `${id}-hint` : undefined} {...input} />
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
