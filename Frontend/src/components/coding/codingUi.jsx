import React, { useEffect, useRef, useState } from 'react';
import { formatClock } from './codingHelpers';

/**
 * Components shared by every page that hosts the coding workspace: the coding
 * test (TakeCodingTest.jsx) and coding questions inside an ordinary or
 * MCQ + Coding test (TakeTest.jsx). Plain helpers live in codingHelpers.js.
 */

export function CustomDropdown({ value, onChange, options, className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value) || options[0];

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-1 px-3 h-8 rounded-md text-[13px] text-white/90 bg-white/[0.06] hover:bg-white/10 transition-colors"
      >
        <span className="truncate">{selectedOption?.label}</span>
        <svg className={`w-3.5 h-3.5 shrink-0 text-white/50 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 rounded-lg border border-white/10 bg-[#3c3c3c] shadow-2xl overflow-hidden animate-in">
          <div className="max-h-60 overflow-y-auto lc-scroll py-1">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`w-full text-left px-3 py-1.5 text-[13px] transition-colors flex items-center justify-between ${
                  value === option.value ? 'text-white bg-white/10' : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <span>{option.label}</span>
                {value === option.value && (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** LeetCode-style labelled value box used for Input / Output / Expected. */
export const LcBox = ({ label, value, tone = 'text-white/90' }) =>
  value === null || value === undefined || value === '' ? null : (
    <div className="mb-3">
      <div className="text-[12px] text-white/50 mb-1.5">{label}</div>
      <pre className={`bg-white/[0.06] rounded-lg px-3 py-2.5 text-[13px] font-mono whitespace-pre-wrap break-words ${tone}`}>
        {value}
      </pre>
    </div>
  );

/** The workspace's countdown pill, amber under five minutes and red under one. */
export const TimerPill = ({ seconds }) => (
  <div className={`h-8 px-3 rounded-md flex items-center gap-1.5 text-[13px] font-medium tabular-nums ${
    seconds <= 60 ? 'bg-[#ef4743]/15 text-[#ef4743]'
      : seconds <= 300 ? 'bg-[#ffb800]/15 text-[#ffb800]'
        : 'bg-white/[0.06] text-white/80'
  }`}>
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    {formatClock(seconds)}
  </div>
);

export const Spinner = ({ className = 'w-4 h-4' }) => (
  <svg className={`${className} animate-spin`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);
