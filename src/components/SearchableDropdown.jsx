import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, User, Monitor, Box, Clock, Heart, Download, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../lib/utils";
import { getCharacterPortrait, GLOBAL_CATEGORIES } from "../lib/portraits";

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
    
    const portrait = getCharacterPortrait(item, gameId);
    if (portrait) {
      return (
        <div className="w-5 h-5 rounded-full overflow-hidden bg-white/10 shrink-0">
          <img src={portrait} alt="" className="w-full h-full object-cover" />
        </div>
      );
    }
    return <User size={size} />;
  };

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl text-sm transition-all focus:outline-none focus:border-(--active-accent)/50 focus:ring-1 focus:ring-(--active-accent)/30 hover:bg-black/60 shadow-inner",
          isOpen ? "border-(--active-accent) ring-1 ring-(--active-accent)/20" : "",
          selectedLabel === null ? "text-white/40" : "text-white font-medium"
        )}
      >
        <div className="flex items-center gap-2 truncate">
          {selectedLabel && <span className="text-(--active-accent) shrink-0">{renderIcon(selectedLabel, 14)}</span>}
          <span className="truncate">{selectedLabel || placeholder}</span>
        </div>
        <ChevronDown 
          size={16} 
          className={cn("text-white/40 transition-transform duration-300", isOpen && "rotate-180")} 
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
              "absolute z-100 left-0 right-0 bg-surface/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden",
              direction === "down" ? "top-full mt-2" : "bottom-full mb-2"
            )}
          >
            {/* Search Input */}
            <div className="p-3 border-b border-white/5 flex items-center gap-2 sticky top-0 bg-black/40 shadow-inner z-10">
              <Search size={14} className="text-gray-500" />
              <input
                autoFocus
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent border-none text-xs text-white focus:outline-none placeholder:text-gray-600"
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
                          ? "bg-(--active-accent)/20 text-(--active-accent) border border-(--active-accent)/30 shadow-[0_0_15px_var(--active-accent)]/20"
                          : "text-gray-400 hover:bg-white/5 hover:text-white border border-transparent"
                      )}
                    >
                      <span className={cn("shrink-0", isSelected ? "text-black" : "text-white/50")}>
                        {renderIcon(itemLabel, 14)}
                      </span>
                      <span className="truncate flex-1 font-medium">{itemLabel}</span>
                    </button>
                  );
                })
              ) : (
                <div className="p-8 text-center text-xs text-gray-600 italic">
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
