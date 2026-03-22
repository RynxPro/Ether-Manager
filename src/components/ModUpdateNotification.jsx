import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, X, Download } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * Component to display available mod updates
 * Shows notifications for mods with newer versions
 */
export default function ModUpdateNotification({
  updates = {},
  onDismiss,
  onDismissAll,
  onUpdate,
  className = '',
}) {
  const updateList = Object.values(updates);

  if (updateList.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className={cn(
          'fixed bottom-6 right-6 max-w-sm bg-surface border border-primary/30 rounded-2xl shadow-2xl overflow-hidden z-40',
          className
        )}
      >
        {/* Header */}
        <div className="bg-primary/10 border-b border-primary/20 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <AlertCircle size={16} className="text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">
                {updateList.length} Mod Update{updateList.length !== 1 ? 's' : ''} Available
              </h3>
              <p className="text-xs text-text-muted">
                New versions are available on GameBanana
              </p>
            </div>
          </div>
          <button
            onClick={onDismissAll}
            className="flex-shrink-0 w-6 h-6 rounded hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <X size={14} className="text-text-muted" />
          </button>
        </div>

        {/* Update List */}
        <div className="max-h-64 overflow-y-auto">
          {updateList.slice(0, 5).map((update, index) => (
            <motion.div
              key={update.gamebananaId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="px-6 py-4 border-b border-border/50 last:border-b-0 flex items-start justify-between hover:bg-white/5 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-text-primary truncate">
                  {update.modName}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  Updated {update.daysSinceUpdate} day
                  {update.daysSinceUpdate !== 1 ? 's' : ''} ago
                </p>
              </div>
              <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                <button
                  onClick={() => onDismiss(update.gamebananaId)}
                  className="p-1.5 rounded hover:bg-white/10 transition-colors"
                  title="Dismiss"
                >
                  <X size={14} className="text-text-muted" />
                </button>
                <button
                  onClick={() => onUpdate(update.gamebananaId)}
                  className="p-1.5 rounded bg-primary/20 hover:bg-primary/30 transition-colors text-primary"
                  title="Update now"
                >
                  <Download size={14} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Footer */}
        {updateList.length > 5 && (
          <div className="px-6 py-3 bg-white/5 border-t border-border/50 text-center">
            <p className="text-xs text-text-muted">
              +{updateList.length - 5} more update{updateList.length - 5 !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
