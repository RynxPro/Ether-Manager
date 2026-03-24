import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, User, Monitor, Box, Clock, Heart, Download, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../lib/utils";
import { useCharacterPortrait } from "../hooks/useCharacterPortrait";

export default function SearchableDropdown({ 
  items, 
  value, 
  onChange, 
  placeholder = "Select an item...",
  gameId,
  className,
  direction = "down"
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getItemLabel = (item) => (typeof item === "string" ? item : item.label);
  const getItemValue = (item) => (typeof item === "string" ? item : item.value);

  const filteredItems = items.filter(item => 
    getItemLabel(item).toLowerCase().includes(search.toLowerCase())
  );

  const selectedItemData = items.find(item => getItemValue(item) === value) || null;
  const selectedLabel = selectedItemData ? getItemLabel(selectedItemData) : null;

  const renderIcon = (item, size = 16) => {
    if (!item) return null;
    const label = item.toLowerCase();
    
    if (label === "user interface") return <Monitor size={size} />;
    if (label === "miscellaneous") return <Box size={size} />;
    if (label === "latest") return <Clock size={size} className="text-white/40" />;
    if (label === "most liked") return <Heart size={size} className="text-white/40" />;
    if (label === "most downloaded") return <Download size={size} className="text-white/40" />;
    if (label === "most viewed") return <Eye size={size} className="text-white/40" />;

    return <CharacterIcon item={item} gameId={gameId} size={size} />;
  };

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-2 bg-surface backdrop-blur-md border border-border rounded-xl text-sm transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 hover:bg-white/5 align-middle",
          isOpen ? "border-primary ring-1 ring-primary/20" : "",
          selectedLabel === null ? "text-text-muted" : "text-text-primary font-medium"
        )}
      >
        <div className="flex items-center gap-2 truncate">
          {selectedLabel && <span className="text-primary shrink-0">{renderIcon(selectedLabel, 14)}</span>}
          <span className="truncate">{selectedLabel || placeholder}</span>
        </div>
        <ChevronDown 
          size={16} 
          className={cn("text-text-muted transition-transform duration-300", isOpen && "rotate-180")} 
        />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: direction === "down" ? -4 : 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: direction === "down" ? -4 : 4, scale: 0.98 }}
            className={cn(
              "absolute z-100 left-0 right-0 bg-surface/95 backdrop-blur-2xl border border-border rounded-2xl shadow-surface overflow-hidden",
              direction === "down" ? "top-full mt-2" : "bottom-full mb-2"
            )}
          >
            {/* Search Input */}
            <div className="p-3 border-b border-border flex items-center gap-2 sticky top-0 bg-surface shadow-inner z-10">
              <Search size={14} className="text-text-muted" />
              <input
                autoFocus
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent border-none text-xs text-text-primary focus:outline-none placeholder:text-text-muted"
              />
            </div>

            {/* List */}
            <div className="max-h-[240px] overflow-y-auto custom-scrollbar p-1">
              {filteredItems.length > 0 ? (
                filteredItems.map((item) => {
                  const itemValue = getItemValue(item);
                  const itemLabel = getItemLabel(item);
                  const isSelected = value === itemValue;
                  
                  return (
                    <button
                      key={itemValue}
                      type="button"
                      onClick={() => {
                        onChange(itemValue);
                        setIsOpen(false);
                        setSearch("");
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all text-left",
                        isSelected
                          ? "bg-primary/20 text-primary border border-primary/30 shadow-[0_0_15px_var(--color-primary)]/20"
                          : "text-text-muted hover:bg-white/5 hover:text-text-primary border border-transparent"
                      )}
                    >
                      <span className={cn("shrink-0", isSelected ? "text-primary" : "text-text-muted")}>
                        {renderIcon(itemLabel, 14)}
                      </span>
                      <span className="truncate flex-1 font-medium">{itemLabel}</span>
                    </button>
                  );
                })
              ) : (
                <div className="p-8 text-center text-xs text-text-muted italic">
                  No matching items
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CharacterIcon({ item, gameId, size }) {
  const portraitUrl = useCharacterPortrait(item, gameId);

  if (portraitUrl) {
    return (
      <div className="w-5 h-5 rounded-full overflow-hidden bg-white/10 shrink-0">
        <img src={portraitUrl} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }

  return <User size={size} />;
}
