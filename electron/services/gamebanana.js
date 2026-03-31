import { assertInteger, assertIntegerArray, assertOptionalString, assertPlainObject } from "./validation.js";

const GB_API = "https://gamebanana.com/apiv10";
const GB_PROPERTIES =
  "_idRow,_sName,_sDescription,_sText,_aPreviewMedia,_aFiles,_tsDateUpdated,_nLikeCount,_nDownloadCount,_nViewCount,_aSubmitter,_aGame,_aCategory,_aRootCategory";

const characterCategoryCache = {};

function withThumbnail(mod) {
  const images = mod._aPreviewMedia?._aImages;
  let thumbnailUrl = null;
  if (images && images.length > 0) {
    const img = images[0];
    const fileName = img._sFile530 || img._sFile || img._sFile220;
    thumbnailUrl = fileName ? `${img._sBaseUrl}/${fileName}` : null;
  }
  return { ...mod, thumbnailUrl };
}

export async function fetchFromGB(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "AetherManager/1.0.0" },
  });
  if (!res.ok) throw new Error(`GB API error: ${res.status}`);
  return res.json();
}

export async function fetchGbMod(gamebananaId) {
  const id = assertInteger(gamebananaId, "gamebananaId", { min: 1 });
  const data = await fetchFromGB(
    `${GB_API}/Mod/${id}?_csvProperties=${encodeURIComponent(GB_PROPERTIES)}`,
  );

  const allImages = [];
  const images = data._aPreviewMedia?._aImages;
  if (images) {
    images.forEach((img) => {
      const url = img._sFile530
        ? `${img._sBaseUrl}/${img._sFile530}`
        : img._sFile
          ? `${img._sBaseUrl}/${img._sFile}`
          : null;
      if (url) allImages.push(url);
    });
  }

  return {
    ...data,
    thumbnailUrl: allImages.length > 0 ? allImages[0] : null,
    allImages,
  };
}

export async function fetchGbModsBatch(ids) {
  if (!ids || ids.length === 0) return [];
  const validIds = assertIntegerArray(ids, "ids");

  const results = await Promise.all(
    validIds.map(async (id) => {
      try {
        return await fetchFromGB(
          `${GB_API}/Mod/${id}?_csvProperties=_idRow,_tsDateUpdated,_aPreviewMedia`,
        );
      } catch (error) {
        console.error(`[BatchUpdate] Failed to fetch mod ${id}:`, error.message);
        return null;
      }
    }),
  );

  return results.filter(Boolean);
}

export async function fetchGbModsSummaries(ids) {
  if (!ids || ids.length === 0) return [];
  const validIds = assertIntegerArray(ids, "ids");

  const summaryProperties =
    "_idRow,_sName,_aPreviewMedia,_nLikeCount,_nDownloadCount,_nViewCount,_tsDateUpdated,_aSubmitter,_sProfileUrl";

  const results = await Promise.all(
    validIds.map(async (id) => {
      try {
        const data = await fetchFromGB(
          `${GB_API}/Mod/${id}?_csvProperties=${encodeURIComponent(summaryProperties)}`,
        );
        return withThumbnail(data);
      } catch (error) {
        console.error(
          `[BookmarkSummary] Failed to fetch mod ${id}:`,
          error.message,
        );
        return null;
      }
    }),
  );

  return results.filter(Boolean);
}

async function resolveCharCategory(gameId, charName) {
  const searchLower = charName.toLowerCase();
  const cacheKey = `${gameId}_${searchLower}`;
  if (characterCategoryCache[cacheKey]) {
    return characterCategoryCache[cacheKey];
  }

  if (searchLower === "ui" || searchLower.includes("interface")) {
    if (gameId === 19567) return 30395;
  }
  if (searchLower === "misc" || searchLower === "miscellaneous") {
    if (gameId === 19567) return 29874;
  }

  try {
    const searchUrl = `${GB_API}/Util/Search/Results?_sModelName=Mod&_idGameRow=${gameId}&_nPage=1&_nPerpage=3&_sSearchString=${encodeURIComponent(charName)}`;
    const searchRes = await fetchFromGB(searchUrl);
    if (!searchRes._aRecords) return null;

    for (const mod of searchRes._aRecords) {
      const modData = await fetchFromGB(
        `${GB_API}/Mod/${mod._idRow}?_csvProperties=_aRootCategory,_aCategory`,
      );
      if (!modData._aCategory || !modData._aRootCategory) {
        continue;
      }

      const rootName = (modData._aRootCategory._sName || "").toLowerCase();
      const catName = (modData._aCategory._sName || "").toLowerCase();

      if (rootName.includes("skin") || rootName.includes("character")) {
        const catId = modData._aCategory._idRow;
        characterCategoryCache[cacheKey] = catId;
        return catId;
      }

      if (searchLower.includes("interface") || searchLower === "ui") {
        if (
          rootName.includes("ui") ||
          rootName.includes("gui") ||
          rootName.includes("interface") ||
          catName.includes("ui") ||
          catName.includes("gui") ||
          catName.includes("interface")
        ) {
          const catId = modData._aRootCategory._idRow;
          characterCategoryCache[cacheKey] = catId;
          return catId;
        }
      }

      if (searchLower.includes("misc")) {
        if (
          rootName.includes("misc") ||
          rootName.includes("other") ||
          catName.includes("misc") ||
          catName.includes("other")
        ) {
          const catId = modData._aRootCategory._idRow;
          characterCategoryCache[cacheKey] = catId;
          return catId;
        }
      }
    }
  } catch (error) {
    console.error("Failed to auto-discover category ID:", error.message);
  }

  return null;
}

export async function browseGbMods(args = {}) {
  assertPlainObject(args, "browseArgs");
  const gbGameId = assertInteger(args.gbGameId, "gbGameId", { min: 1 });
  const page = assertInteger(args.page ?? 1, "page", { min: 1, max: 1000 });
  const perPage = assertInteger(args.perPage ?? 20, "perPage", {
    min: 1,
    max: 100,
  });
  const sort =
    assertOptionalString(args.sort ?? "", "sort", {
      allowEmpty: true,
      maxLength: 32,
    }) || "";
  const context =
    assertOptionalString(args.context ?? "", "context", {
      allowEmpty: true,
      maxLength: 120,
    }) || "";
  const search =
    assertOptionalString(args.search ?? "", "search", {
      allowEmpty: true,
      maxLength: 240,
    }) || "";
  const submitterId =
    args.submitterId == null
      ? null
      : assertInteger(args.submitterId, "submitterId", { min: 1 });

  const browseFields =
    "name,_aPreviewMedia,_aSubmitter,_nLikeCount,_nDownloadCount,_nViewCount,_tsDateUpdated,_sProfileUrl";
  const sortAliases = {
    likes: "Generic_MostLiked",
    downloads: "Generic_MostDownloaded",
    views: "Generic_MostViewed",
  };
  const sortStr = sort && sortAliases[sort] ? `&_sSort=${sortAliases[sort]}` : "";
  const hasManualSearch = search && search.trim().length >= 1;
  const hasCategoryContext = context && context.trim().length >= 1;

  let url;

  if (submitterId) {
    url = `${GB_API}/Mod/Index?_aFilters[Generic_Game]=${gbGameId}&_aFilters[Generic_Submitter]=${submitterId}&_nPage=${page}&_nPerpage=${perPage}${sortStr}&_csvFields=${encodeURIComponent(browseFields)}`;
  } else if (hasManualSearch) {
    const combinedQuery = [context, search].filter(Boolean).join(" ");
    url = `${GB_API}/Util/Search/Results?_sModelName=Mod&_idGameRow=${gbGameId}&_sSearchString=${encodeURIComponent(combinedQuery)}&_nPage=${page}&_nPerpage=${perPage}${sortStr}&_csvProperties=${encodeURIComponent(browseFields)}`;
  } else if (hasCategoryContext) {
    const charName = context.trim();
    const catId = await resolveCharCategory(gbGameId, charName);

    if (catId) {
      url = `${GB_API}/Mod/Index?_aFilters[Generic_Category]=${catId}&_nPage=${page}&_nPerpage=${perPage}${sortStr}&_csvFields=${encodeURIComponent(browseFields)}`;
    } else {
      url = `${GB_API}/Util/Search/Results?_sModelName=Mod&_idGameRow=${gbGameId}&_sSearchString=${encodeURIComponent(charName)}&_nPage=${page}&_nPerpage=${perPage}${sortStr}&_csvProperties=${encodeURIComponent(browseFields)}`;
    }
  } else {
    url = `${GB_API}/Mod/Index?_aFilters[Generic_Game]=${gbGameId}&_nPage=${page}&_nPerpage=${perPage}${sortStr}&_csvFields=${encodeURIComponent(browseFields)}`;
  }

  console.log("GB API Request URL:", url);
  const data = await fetchFromGB(url);

  return {
    records: (data._aRecords || []).map(withThumbnail),
    total: data._aMetadata?._nRecordCount || 0,
  };
}
