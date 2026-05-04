'use client'
import { useRef, useState, useCallback } from 'react'

interface DropZoneProps {
  accept: string
  onFile: (file: File) => void
  label?: string
  currentFileName?: string | null
  disabled?: boolean
}

export default function DropZone({ accept, onFile, label, currentFileName, disabled }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }, [onFile, disabled])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    e.target.value = ''
  }

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`
        border-2 border-dashed rounded-lg px-6 py-8 text-center cursor-pointer transition-colors
        ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
      <div className="text-gray-400 mb-2 text-2xl">📂</div>
      {currentFileName ? (
        <p className="text-sm font-medium text-blue-700 mb-1">{currentFileName}</p>
      ) : null}
      <p className="text-sm text-gray-600 font-medium">
        {label ?? 'Drag & drop a file here'}
      </p>
      <p className="text-xs text-gray-400 mt-1">or click to browse your computer</p>
      <p className="text-xs text-gray-400 mt-1">Accepted: {accept}</p>
    </div>
  )
}
