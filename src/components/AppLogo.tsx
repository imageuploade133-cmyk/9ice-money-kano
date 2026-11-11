"use client";

import React, { useState, useEffect } from "react";

interface AppLogoProps {
  logoUrl?: string;
  size?: number;
  className?: string;
  alt?: string;
}

export const AppLogo: React.FC<AppLogoProps> = ({
  logoUrl,
  size = 28,
  className = "",
  alt = "E-Global Pay Logo",
}) => {
  const [imageError, setImageError] = useState(false);

  // Reset image error state if a valid custom logoUrl is provided
  useEffect(() => {
    setImageError(false);
  }, [logoUrl]);

  const cleanUrl = logoUrl && !logoUrl.includes("vercel.app/_next/image") ? logoUrl : null;

  if (cleanUrl && !imageError) {
    return (
      <img
        src={cleanUrl}
        alt={alt}
        width={size}
        height={size}
        className={`object-contain ${className}`}
        style={{ width: `${size}px`, height: `${size}px` }}
        onError={() => setImageError(true)}
      />
    );
  }

  // Pure Vector SVG Code Logo - 100% Instant Render, Zero Network Overhead, Zero Crash Risk
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 500 500"
      xmlns="http://www.w3.org/2000/svg"
      className={`select-none flex-shrink-0 ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-label={alt}
    >
      {/* Orange "e" */}
      <path
        fill="#F87B00"
        fillRule="evenodd"
        d="
          M314 172
          C298 168 272 165 241 166
          C219 170 193 178 173 188
          C150 206 132 224 114 251
          C107 266 98 299 98 349
          C104 371 112 390 129 414
          C146 430 175 449 200 459
          C226 465 260 467 292 463
          C319 455 343 443 367 423
          C385 398 399 365 403 347
          C403 331 395 344 375 366
          C357 379 323 396 292 404
          C253 404 236 400 213 386
          C200 371 193 358 192 345
          L194 343
          L298 343
          C325 339 344 333 355 327
          C376 307 385 291 390 273
          C391 254 385 229 373 209
          C359 195 341 183 314 172
          Z

          M192 288
          C193 279 200 267 214 253
          C236 241 244 239 281 239
          C291 241 302 248 310 258
          C310 273 307 278 298 286
          C287 290 194 290 192 288
          Z
        "
      />

      {/* Left leaf */}
      <path
        fill="#70AC00"
        d="
          M103 21
          C104 53 110 80 117 96
          C126 110 145 129 165 141
          C188 149 220 153 239 151
          C238 146 227 132 161 71
          C162 69 165 69 174 73
          C208 97 245 133 256 148
          C260 151 261 150 261 150
          C257 119 251 101 235 73
          C218 56 194 42 173 34
          C122 22 103 21 103 21
          Z
        "
      />

      {/* Right leaf */}
      <path
        fill="#70AC00"
        d="
          M369 49
          C345 52 326 58 310 67
          C296 79 288 90 280 108
          C276 127 276 143 276 143
          C303 110 322 93 324 94
          C323 97 298 128 289 148
          C297 149 321 143 336 135
          C347 125 355 115 363 99
          C369 72 369 49 369 49
          Z
        "
      />
    </svg>
  );
};
