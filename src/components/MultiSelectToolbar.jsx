import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Copy, CheckSquare, X } from 'lucide-react';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';

/**
 * Multi-select toolbar component
 * Displays when items are selected and provides bulk action buttons
 */
export default function MultiSelectToolbar({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onBulkDelete,
  onBulkToggle,
  isAllSelected,
  isPartiallySelected,
  isLoading = false,
  className = '',
}) {
  const hasSelection = selectedCount > 0;

  return (
    <AnimatePresence>
      {hasSelection && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'bg-surface border border-primary/30 rounded-xl p-4 flex items-center justify-between shadow-lg',
            className
          )}
        >
          {/* Left: Info and Selection */}
          <div className="flex items-center gap-4">
            {/* Checkbox */}
            <button
              onClick={onSelectAll}
              className="flex items-center justify-center w-6 h-6 rounded-lg border-2 transition-all"
              style={{
                borderColor: 'var(--color-primary)',
                backgroundColor: isAllSelected
                  ? 'var(--color-primary)'
                  : isPartiallySelected
                    ? 'var(--color-primary)'
                    : 'transparent',
              }}
              title={isAllSelected ? 'Deselect all' : 'Select all'}
            >
              <CheckSquare
                size={16}
                color={isAllSelected || isPartiallySelected ? 'black' : 'transparent'}
              />
            </button>

            {/* Count Text */}
            <div className="text-sm font-medium text-text-primary">
              {selectedCount} selected
              {totalCount && <span className="text-text-muted ml-1">of {totalCount}</span>}
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onBulkToggle}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <Copy size={14} />
              Toggle State
            </Button>

            <Button
              variant="danger"
              size="sm"
              onClick={onBulkDelete}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <Trash2 size={14} />
              Delete ({selectedCount})
            </Button>

            <button
              onClick={onDeselectAll}
              disabled={isLoading}
              className="w-8 h-8 rounded-lg hover:bg-white/5 transition-colors flex items-center justify-center text-text-muted hover:text-text-primary"
              title="Deselect all"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
