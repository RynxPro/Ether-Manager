import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';

/**
 * Component to display mod conflicts
 * Shows which mods have overlapping files
 */
export default function ModConflictWarning({
  conflicts = [],
  isOpen = false,
  onClose,
  className = '',
}) {
  const [expandedIndex, setExpandedIndex] = useState(null);

  if (!conflicts || conflicts.length === 0) {
    return null;
  }

  const totalConflictingFiles = conflicts.reduce((sum, c) => sum + c.conflictCount, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        'bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 space-y-3',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-yellow-500/20 flex items-center justify-center mt-0.5">
          <AlertTriangle size={16} className="text-yellow-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-white mb-1">
            Mod Conflicts Detected
          </h3>
          <p className="text-sm text-text-secondary">
            {conflicts.length} mod pair{conflicts.length !== 1 ? 's' : ''} have{' '}
            {conflicts.length !== 1 ? '' : 's'} {totalConflictingFiles} overlapping file
            {totalConflictingFiles !== 1 ? 's' : ''}.{' '}
            <span className="text-yellow-500">
              Only the last enabled mod's files will be used.
            </span>
          </p>
        </div>
      </div>

      {/* Conflicts List */}
      <div className="space-y-2">
        {conflicts.map((conflict, index) => (
          <motion.div
            key={`conflict-${index}`}
            className="bg-background/50 border border-yellow-500/20 rounded-lg overflow-hidden"
          >
            {/* Conflict Header */}
            <button
              onClick={() =>
                setExpandedIndex(expandedIndex === index ? null : index)
              }
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-text-primary">
                    {conflict.mods.join(' ↔ ')}
                  </span>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-bold tracking-wider',
                      conflict.severity === 'high'
                        ? 'bg-red-500/20 text-red-400'
                        : conflict.severity === 'medium'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-blue-500/20 text-blue-400'
                    )}
                  >
                    {conflict.severity.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-text-muted">
                  {conflict.conflictCount} file{conflict.conflictCount !== 1 ? 's' : ''}
                </p>
              </div>
              {expandedIndex === index ? (
                <ChevronUp size={16} className="text-text-muted flex-shrink-0" />
              ) : (
                <ChevronDown size={16} className="text-text-muted flex-shrink-0" />
              )}
            </button>

            {/* Conflict Details */}
            <AnimatePresence>
              {expandedIndex === index && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="bg-background border-t border-yellow-500/20 px-4 py-3 max-h-64 overflow-y-auto"
                >
                  <div className="space-y-1">
                    {conflict.conflictingFiles.slice(0, 10).map((file, i) => (
                      <div
                        key={`file-${i}`}
                        className="text-xs text-text-muted font-mono truncate"
                        title={file}
                      >
                        📄 {file}
                      </div>
                    ))}
                    {conflict.conflictingFiles.length > 10 && (
                      <div className="text-xs text-text-muted italic pt-2">
                        +{conflict.conflictingFiles.length - 10} more file
                        {conflict.conflictingFiles.length - 10 !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      {/* Info Message */}
      <div className="bg-white/5 rounded-lg p-3 text-xs text-text-secondary space-y-1">
        <p>
          💡 <strong>Tip:</strong> To resolve conflicts, either:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Disable one of the conflicting mods</li>
          <li>Rearrange their load order (not yet available)</li>
          <li>Choose compatible mod alternatives</li>
        </ul>
      </div>
    </motion.div>
  );
}
