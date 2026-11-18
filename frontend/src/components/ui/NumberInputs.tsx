import { useEffect, useState, type ComponentPropsWithRef } from "react";
import { groupDecimal, parseAmountInput, shiftDecimal } from "@/lib/decimal";
import { minorUnits } from "@/lib/format";
import { Input } from "./Form";

type BaseProps = Omit<ComponentPropsWithRef<"input">, "value" | "onChange" | "defaultValue">;

/**
 * Amount field. Accepts "25,000,000", "25m", "1.5bn" or "250k"; shows grouped
 * minor units once you leave it. The value is a plain decimal string ("" when empty).
 */
export function MoneyInput({ value, onChange, currency, ...rest }: BaseProps & { value: string; onChange: (v: string) => void; currency?: string }) {
  const dp = currency ? minorUnits(currency) : 2;
  const pretty = (v: string) => (v && parseAmountInput(v) !== null ? groupDecimal(v, dp) : v);
  const [text, setText] = useState(() => pretty(value));
  const [focused, setFocused] = useState(false);

  // Follow outside changes (form reset, currency switch) while not typing.
  useEffect(() => {
    if (!focused) setText(pretty(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, dp]);

  return (
    <Input
      {...rest}
      numeric
      suffix={currency}
      value={text}
      onFocus={(e) => {
        setFocused(true);
        rest.onFocus?.(e);
      }}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = parseAmountInput(e.target.value);
        onChange(parsed ?? (e.target.value.trim() === "" ? "" : e.target.value));
      }}
      onBlur={(e) => {
        setFocused(false);
        const parsed = parseAmountInput(text);
        if (parsed !== null) {
          setText(groupDecimal(parsed, dp));
          onChange(parsed);
        }
        rest.onBlur?.(e);
      }}
    />
  );
}

/** Percentage field: shows "5.25", stores the fraction "0.0525" as the API expects. */
export function PercentInput({ value, onChange, ...rest }: BaseProps & { value: string; onChange: (fraction: string) => void }) {
  const toPct = (f: string) => (f && /^-?\d+(\.\d+)?$/.test(f) ? shiftDecimal(f, 2) : f);
  const [text, setText] = useState(() => toPct(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(toPct(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      {...rest}
      numeric
      suffix="%"
      value={text}
      onFocus={(e) => {
        setFocused(true);
        rest.onFocus?.(e);
      }}
      onChange={(e) => {
        const t = e.target.value.replace(/[%\s]/g, "");
        setText(e.target.value);
        onChange(/^-?\d*\.?\d+$/.test(t) ? shiftDecimal(t.startsWith(".") ? `0${t}` : t.replace(/^-\./, "-0."), -2) : t);
      }}
      onBlur={(e) => {
        setFocused(false);
        rest.onBlur?.(e);
      }}
    />
  );
}
