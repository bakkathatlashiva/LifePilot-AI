import React from "react";
import { cn } from "../../lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Input({
  label,
  error,
  leftIcon,
  rightIcon,
  className,
  id,
  ...props
}: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-slate-300 mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
            {leftIcon}
          </div>
        )}
        <input
          id={inputId}
          className={cn(
            "bg-dark-800 border border-white/10 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 w-full",
            "focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30",
            "transition-all duration-200",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            leftIcon ? "pl-9" : undefined,
            rightIcon ? "pr-9" : undefined,
            error
              ? "border-red-500/50 focus:border-red-500/60 focus:ring-red-500/20"
              : undefined,
            className,
          )}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
            {rightIcon}
          </div>
        )}
      </div>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export function Select({
  label,
  error,
  options,
  className,
  id,
  ...props
}: SelectProps) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-slate-300 mb-1.5"
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={cn(
          "bg-dark-800 border border-white/10 rounded-xl px-4 py-2.5 text-slate-100 w-full",
          "focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30",
          "transition-all duration-200 appearance-none",
          error && "border-red-500/50",
          className,
        )}
        {...props}
      >
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            className="bg-dark-900 text-slate-100"
          >
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({
  label,
  error,
  className,
  id,
  ...props
}: TextareaProps) {
  const textareaId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={textareaId}
          className="block text-sm font-medium text-slate-300 mb-1.5"
        >
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={cn(
          "bg-dark-800 border border-white/10 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 w-full",
          "focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30",
          "transition-all duration-200 resize-none",
          error && "border-red-500/50",
          className,
        )}
        rows={4}
        {...props}
      />
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
