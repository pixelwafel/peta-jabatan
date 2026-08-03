import React, { useState, useEffect } from 'react';

interface NumberInputProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  className?: string;
  disabled?: boolean;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  min = 0,
  className = '',
  disabled = false,
}) => {
  const [focused, setFocused] = useState(false);
  const [tempText, setTempText] = useState<string>(value.toString());

  useEffect(() => {
    if (!focused) {
      setTempText(value.toString());
    }
  }, [value, focused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setTempText(raw);

    if (raw === '' || raw === '-') {
      onChange(min);
      return;
    }

    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, parsed);
      onChange(clamped);
    }
  };

  const handleBlur = () => {
    setFocused(false);
    if (tempText === '' || isNaN(parseInt(tempText, 10))) {
      setTempText(min.toString());
      onChange(min);
    } else {
      const parsed = Math.max(min, parseInt(tempText, 10));
      setTempText(parsed.toString());
      onChange(parsed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = value + 1;
      onChange(next);
      setTempText(next.toString());
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(min, value - 1);
      onChange(next);
      setTempText(next.toString());
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    if (!focused) return; // Only adjust on wheel while focused!
    e.preventDefault();
    if (e.deltaY < 0) {
      const next = value + 1;
      onChange(next);
      setTempText(next.toString());
    } else if (e.deltaY > 0) {
      const next = Math.max(min, value - 1);
      onChange(next);
      setTempText(next.toString());
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={focused && tempText === '0' ? '' : tempText}
      onChange={handleChange}
      onFocus={() => {
        setFocused(true);
        setTempText(value.toString());
      }}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      disabled={disabled}
      className={`bg-slate-800 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-100 font-mono text-center rounded px-1.5 py-1 text-xs w-full outline-none transition-colors ${className}`}
    />
  );
};
