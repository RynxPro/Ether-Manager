import { Eye, EyeOff, ImageIcon, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";

export default function ModGallery({
  images,
  blurHero,
  setRevealedDetail,
  setCurrentImgIndex,
  setShowLightbox,
  isLibraryContext,
  mod,
  handleSetThumbnailUrl,
  handleSetThumbnail,
  isAddingThumbUrl,
  setIsAddingThumbUrl,
  customThumbUrl,
  setCustomThumbUrl,
}) {
  return (
    <div className="w-full max-w-[1400px] mx-auto px-6 lg:px-12 pt-20">
      <div className="relative w-full h-[50vh] min-h-[400px] max-h-[600px] rounded-[2rem] overflow-hidden bg-black/20 shadow-2xl border border-white/5">
        {images.length > 0 ? (
          <>
            {blurHero ? (
              <>
                <div
                  className="absolute inset-0 bg-cover bg-center blur-3xl opacity-30 transform scale-110"
                  style={{ backgroundImage: `url(${images[0]})` }}
                />
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 border border-red-500/30">
                    <EyeOff size={32} className="text-red-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-black uppercase tracking-widest text-red-500">
                      Classified
                    </p>
                    <p className="mt-2 text-sm text-white/50">
                      This mod contains potentially explicit content.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRevealedDetail(true)}
                    className="mt-4 flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-8 py-3 text-sm font-bold text-red-100 transition-colors hover:bg-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                  >
                    <Eye size={16} /> Reveal Content
                  </button>
                </div>
              </>
            ) : (
              <>
                {(() => {
                  const gridImages = images.slice(0, 5);
                  const handleImageClick = (idx) => {
                    setCurrentImgIndex(idx);
                    setShowLightbox(true);
                  };

                  const renderImg = (src, idx, extraClass = "") => (
                    <div
                      key={idx}
                      className={cn(
                        "relative overflow-hidden group cursor-pointer bg-[#0a0a0a]",
                        extraClass
                      )}
                      onClick={() => handleImageClick(idx)}
                    >
                      <img
                        src={src}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 will-change-transform transform-gpu backface-hidden antialiased"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
                    </div>
                  );

                  if (gridImages.length === 1) {
                    return renderImg(gridImages[0], 0, "w-full h-full");
                  }
                  if (gridImages.length === 2) {
                    return (
                      <div className="grid grid-cols-2 gap-2 h-full">
                        {renderImg(gridImages[0], 0)}
                        {renderImg(gridImages[1], 1)}
                      </div>
                    );
                  }
                  if (gridImages.length === 3) {
                    return (
                      <div className="grid grid-cols-3 gap-2 h-full">
                        {renderImg(gridImages[0], 0, "col-span-2")}
                        <div className="flex flex-col gap-2">
                          {renderImg(gridImages[1], 1, "h-1/2")}
                          {renderImg(gridImages[2], 2, "h-1/2")}
                        </div>
                      </div>
                    );
                  }
                  if (gridImages.length === 4) {
                    return (
                      <div className="grid grid-cols-3 grid-rows-2 gap-2 h-full">
                        {renderImg(gridImages[0], 0, "col-span-2 row-span-2")}
                        {renderImg(gridImages[1], 1, "col-span-1 row-span-1")}
                        <div className="grid grid-cols-2 gap-2 col-span-1 row-span-1">
                          {renderImg(gridImages[2], 2)}
                          {renderImg(gridImages[3], 3)}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-4 grid-rows-2 gap-2 h-full">
                      {renderImg(gridImages[0], 0, "col-span-2 row-span-2")}
                      {renderImg(gridImages[1], 1, "col-span-1 row-span-1")}
                      {renderImg(gridImages[2], 2, "col-span-1 row-span-1")}
                      {renderImg(gridImages[3], 3, "col-span-1 row-span-1")}
                      {renderImg(gridImages[4], 4, "col-span-1 row-span-1")}
                    </div>
                  );
                })()}

                {images.length > 5 && (
                  <button
                    onClick={() => {
                      setCurrentImgIndex(5);
                      setShowLightbox(true);
                    }}
                    className="absolute bottom-6 right-6 z-20 flex items-center gap-2 px-4 py-2.5 bg-black/70 hover:bg-black text-white font-black text-xs uppercase tracking-widest rounded-xl backdrop-blur-md border border-white/10 transition-colors shadow-lg group"
                  >
                    <ImageIcon size={16} />
                    Show all {images.length} photos
                  </button>
                )}
              </>
            )}

            {/* Custom Cover Controls (Top Right) */}
            {isLibraryContext && mod.localMod && (
              <div className="absolute top-6 right-6 z-20 flex gap-2">
                {mod.localMod.customThumbnail && (
                  <button
                    onClick={() => handleSetThumbnailUrl(null)}
                    title="Clear custom thumbnail and use default"
                    className="py-2 px-4 rounded-full bg-red-500/80 text-white text-xs font-bold hover:bg-red-600 transition-all border border-red-500/30 flex items-center gap-2 shadow-lg backdrop-blur-md"
                  >
                    <Trash2 size={14} /> Clear
                  </button>
                )}
                <button
                  onClick={handleSetThumbnail}
                  title="Use this image as the thumbnail in your library"
                  className="py-2 px-4 rounded-full bg-black/60 text-white text-xs font-bold hover:bg-primary hover:text-black transition-all border border-white/10 flex items-center gap-2 shadow-lg backdrop-blur-md"
                >
                  <ImageIcon size={14} /> Set as Thumbnail
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full relative flex flex-col items-center justify-center bg-black/20 text-white/20 p-8">
            {/* Custom URL Form overlay if no images */}
            {!isAddingThumbUrl ? (
              <>
                <ImageIcon size={48} className="mb-4 opacity-30" />
                <p className="font-semibold text-lg mb-4">
                  No images available
                </p>
                {isLibraryContext && mod.localMod && (
                  <button
                    onClick={() => setIsAddingThumbUrl(true)}
                    className="py-2.5 px-6 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-white text-sm font-bold transition-all flex items-center gap-2 shadow-lg"
                  >
                    <ImageIcon size={16} className="opacity-70" /> Add Custom
                    Cover Link
                  </button>
                )}
              </>
            ) : (
              <div className="w-full max-w-md flex flex-col gap-3 bg-black/50 p-6 rounded-2xl border border-white/10 backdrop-blur-xl">
                <p className="text-xs font-black text-white uppercase tracking-widest text-center mb-1">
                  Set Custom Cover Link
                </p>
                <input
                  autoFocus
                  type="url"
                  placeholder="Paste image URL (Discord, Imgur, etc)..."
                  value={customThumbUrl}
                  onChange={(e) => setCustomThumbUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customThumbUrl.trim())
                      handleSetThumbnailUrl(customThumbUrl.trim());
                    else if (e.key === "Escape") setIsAddingThumbUrl(false);
                  }}
                  className="w-full px-4 py-3 bg-black/80 border border-white/20 rounded-xl text-sm text-white focus:outline-hidden focus:border-primary/50 shadow-inner"
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => setIsAddingThumbUrl(false)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:bg-white/5 text-white/50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (customThumbUrl.trim())
                        handleSetThumbnailUrl(customThumbUrl.trim());
                    }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-colors"
                  >
                    Save Cover
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
