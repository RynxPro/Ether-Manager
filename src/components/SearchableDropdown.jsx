import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, User, Monitor, Box } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../lib/utils";
import { getCharacterPortrait, GLOBAL_CATEGORIES } from "../lib/portraits";

export default function SearchableDropdown({ 
  items, 
  value, 
  onChange, 
  placeholder = "Select an item...",
  gameId,
  className
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

  const filteredItems = items.filter(item => 
    item.toLowerCase().includes(search.toLowerCase())
  );

  const selectedItem = value || null;

  const renderIcon = (item, size = 16) => {
    if (item === "User Interface") return <Monitor size={size} />;
    if (item === "Miscellaneous") return <Box size={size} />;
    
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
          "w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-all text-sm",
          "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20",
          isOpen ? "border-(--active-accent) ring-1 ring-(--active-accent)/20" : "",
          !value ? "text-gray-500" : "text-white"
        )}
      >
        <div className="flex items-center gap-2 truncate">
          {value && <span className="text-(--active-accent) shrink-0">{renderIcon(value, 14)}</span>}
          <span className="truncate">{value || placeholder}</span>
        </div>
        <ChevronDown 
          size={16} 
          className={cn("text-gray-500 transition-transform duration-300", isOpen && "rotate-180")} 
        />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            className="absolute z-50 bottom-full mb-2 left-0 right-0 bg-[#161625] border border-white/10 rounded-2xl shadow-2xl overflow-hidden shadow-black/50"
          >
            {/* Search Input */}
            <div className="p-3 border-b border-white/5 flex items-center gap-2 sticky top-0 bg-[#161625] z-10">
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
                filteredItems.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      onChange(item);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all text-left",
                      value === item
                        ? "bg-(--active-accent) text-black shadow-lg shadow-(--active-accent)/20"
                        : "text-gray-400 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <span className={cn("shrink-0", value === item ? "text-black" : "text-white/20")}>
                      {renderIcon(item, 14)}
                    </span>
                    <span className="truncate flex-1">{item}</span>
                  </button>
                ))
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
