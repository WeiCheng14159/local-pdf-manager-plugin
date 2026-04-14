import { getString, initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";

const PLUGIN = "Zotero Local PDF Manager";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  const icon = `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`;

  // Right-click: Download PDF (selected)
  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: "lcm-download-pdf",
    label: getString("menu-download-pdf"),
    commandListener: () => downloadPdfsForSelected(),
    icon,
  });

  // Right-click: Remove Local PDFs (selected)
  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: "lcm-remove-local-pdf",
    label: getString("menu-remove-pdf"),
    commandListener: () => removeLocalPdfsForSelected(),
    icon,
  });

  // Tools menu: Download All PDFs in Library
  ztoolkit.Menu.register("menuTools", {
    tag: "menuitem",
    id: "lcm-download-all",
    label: getString("menu-download-all"),
    commandListener: () => downloadAllPdfs(),
    icon,
  });

  // Tools menu: Remove All Local PDFs in Library
  ztoolkit.Menu.register("menuTools", {
    tag: "menuitem",
    id: "lcm-remove-all",
    label: getString("menu-remove-all"),
    commandListener: () => removeAllLocalPdfs(),
    icon,
  });
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Returns all regular items from a list, filtering out attachments/notes.
 */
function getRegularItems(items: Zotero.Item[]): Zotero.Item[] {
  return items.filter((item) => item.isRegularItem());
}

/**
 * Checks whether a regular item has any PDF attachment item (file may or may not exist).
 */
async function hasPdfAttachment(item: Zotero.Item): Promise<boolean> {
  const attachmentIDs: number[] = item.getAttachments();
  for (const id of attachmentIDs) {
    const att = Zotero.Items.get(id);
    if (att?.attachmentContentType === "application/pdf") return true;
  }
  return false;
}

/**
 * Checks whether a regular item has a PDF file on disk.
 */
async function hasPdfOnDisk(item: Zotero.Item): Promise<boolean> {
  const attachmentIDs: number[] = item.getAttachments();
  for (const id of attachmentIDs) {
    const att = Zotero.Items.get(id);
    if (att?.attachmentContentType !== "application/pdf") continue;
    const filePath = await att.getFilePathAsync();
    if (filePath) return true;
  }
  return false;
}

/**
 * Returns PDF attachment items that have a file on disk for a regular item.
 */
async function getLocalPdfAttachments(
  item: Zotero.Item,
): Promise<Zotero.Item[]> {
  const result: Zotero.Item[] = [];
  const attachmentIDs: number[] = item.getAttachments();
  for (const id of attachmentIDs) {
    const att = Zotero.Items.get(id);
    if (att?.attachmentContentType !== "application/pdf") continue;
    const filePath = await att.getFilePathAsync();
    if (filePath) result.push(att);
  }
  return result;
}

/**
 * Gets all regular items in the user's library via Zotero.Search.
 */
async function getAllRegularItems(): Promise<Zotero.Item[]> {
  const s = new Zotero.Search({
    libraryID: Zotero.Libraries.userLibraryID,
  });
  s.addCondition("itemType", "isNot", "attachment");
  s.addCondition("itemType", "isNot", "note");
  const ids = await s.search();
  return ids.map((id: number) => Zotero.Items.get(id) as Zotero.Item);
}

/**
 * Formats bytes into a human-readable string (KB, MB, GB).
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Returns the file size in bytes for a PDF attachment, or 0 if unavailable.
 */
async function getPdfFileSize(att: Zotero.Item): Promise<number> {
  try {
    const filePath = await att.getFilePathAsync();
    if (!filePath) return 0;
    const file = Zotero.File.pathToFile(filePath);
    return file.exists() ? file.fileSize : 0;
  } catch {
    return 0;
  }
}

// ── Download operations ──────────────────────────────────────

async function downloadPdfsForSelected(): Promise<void> {
  const zoteroPane = ztoolkit.getGlobal("ZoteroPane");
  const selectedItems = zoteroPane.getSelectedItems() as Zotero.Item[];
  if (!selectedItems.length) return;
  await batchDownload(getRegularItems(selectedItems));
}

async function downloadAllPdfs(): Promise<void> {
  const allItems = await getAllRegularItems();

  // Count how many actually need a PDF (skip if any PDF attachment item exists)
  const needsCount = (
    await Promise.all(allItems.map(async (item) => !(await hasPdfAttachment(item))))
  ).filter(Boolean).length;

  if (!needsCount) {
    new ztoolkit.ProgressWindow(PLUGIN, { closeOnClick: true })
      .createLine({
        text: getString("all-have-pdf"),
        type: "success",
        progress: 100,
      })
      .show()
      .startCloseTimer(3000);
    return;
  }

  // Confirmation dialog
  const confirmed = Services.prompt.confirm(
    Zotero.getMainWindow() as unknown as mozIDOMWindowProxy,
    getString("confirm-download-title"),
    getString("confirm-download-message", {
      args: { count: String(needsCount) },
    }),
  );
  if (!confirmed) return;

  ztoolkit.log(`[${PLUGIN}] Download All: ${needsCount} PDFs to download`);
  await batchDownload(allItems);
}

async function batchDownload(items: Zotero.Item[]): Promise<void> {
  // Skip items that already have a PDF attachment item (even if file is missing on disk)
  // to avoid creating duplicate attachments after a local PDF was removed.
  const needsPdf: Zotero.Item[] = [];
  for (const item of items) {
    if (!(await hasPdfAttachment(item))) {
      needsPdf.push(item);
    }
  }

  if (!needsPdf.length) {
    new ztoolkit.ProgressWindow(PLUGIN, { closeOnClick: true })
      .createLine({
        text: getString("all-have-pdf"),
        type: "success",
        progress: 100,
      })
      .show()
      .startCloseTimer(3000);
    return;
  }

  const total = needsPdf.length;
  let done = 0;
  let failed = 0;
  let totalBytes = 0;

  const pw = new ztoolkit.ProgressWindow(PLUGIN, {
    closeOnClick: false,
    closeTime: -1,
  })
    .createLine({
      text: getString("download-progress", {
        args: { done: "0", total: String(total), size: "0 B" },
      }),
      type: "default",
      progress: 0,
    })
    .show();

  for (const item of needsPdf) {
    try {
      // 60s timeout per item to avoid hanging on network issues
      await Promise.race([
        Zotero.Attachments.addAvailablePDF(item),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 60000),
        ),
      ]);
      done++;
      // Measure the newly downloaded file and refresh UI
      const attachmentIDs: number[] = item.getAttachments();
      for (const id of attachmentIDs) {
        const att = Zotero.Items.get(id);
        if (att?.attachmentContentType === "application/pdf") {
          totalBytes += await getPdfFileSize(att);
          Zotero.Notifier.trigger("modify", "item", [att.id]);
        }
      }
      Zotero.Notifier.trigger("modify", "item", [item.id]);
    } catch {
      failed++;
    }
    pw.changeLine({
      text: getString("download-progress", {
        args: {
          done: String(done + failed),
          total: String(total),
          size: formatSize(totalBytes),
        },
      }),
      progress: Math.round(((done + failed) / total) * 100),
    });
  }

  pw.changeLine({
    text: getString("download-complete", {
      args: {
        done: String(done),
        total: String(total),
        size: formatSize(totalBytes),
      },
    }),
    type: done > 0 ? "success" : "fail",
    progress: 100,
  });
  pw.startCloseTimer(5000);
}

// ── Remove operations ────────────────────────────────────────

async function removeLocalPdfsForSelected(): Promise<void> {
  const zoteroPane = ztoolkit.getGlobal("ZoteroPane");
  const selectedItems = zoteroPane.getSelectedItems() as Zotero.Item[];
  if (!selectedItems.length) return;
  await batchRemove(getRegularItems(selectedItems));
}

async function removeAllLocalPdfs(): Promise<void> {
  const allItems = await getAllRegularItems();
  ztoolkit.log(`[${PLUGIN}] Remove All: ${allItems.length} items in library`);
  await batchRemove(allItems);
}

async function batchRemove(items: Zotero.Item[]): Promise<void> {
  // Collect PDF attachments with files on disk
  const toRemove: Zotero.Item[] = [];
  for (const item of items) {
    const localPdfs = await getLocalPdfAttachments(item);
    toRemove.push(...localPdfs);
  }

  if (!toRemove.length) {
    new ztoolkit.ProgressWindow(PLUGIN, { closeOnClick: true })
      .createLine({
        text: getString("no-local-pdf"),
        type: "default",
        progress: 100,
      })
      .show()
      .startCloseTimer(3000);
    return;
  }

  const total = toRemove.length;
  let done = 0;
  let totalBytes = 0;

  const pw = new ztoolkit.ProgressWindow(PLUGIN, {
    closeOnClick: false,
    closeTime: -1,
  })
    .createLine({
      text: getString("remove-progress", {
        args: { done: "0", total: String(total), size: "0 B" },
      }),
      type: "default",
      progress: 0,
    })
    .show();

  for (const att of toRemove) {
    try {
      const filePath = await att.getFilePathAsync();
      if (filePath) {
        const file = Zotero.File.pathToFile(filePath);
        if (file.exists()) {
          totalBytes += file.fileSize;
          file.remove(false);
          done++;
          // fileExists() checks the filesystem and updates Zotero's internal
          // cache so the next re-render correctly grays out the icon.
          // reload() is not enough — it only reads from the DB, which has no
          // file-existence info for stored attachments.
          await att.fileExists();
          Zotero.Notifier.trigger("modify", "item", [att.id]);
          if (att.parentItemID) {
            Zotero.Notifier.trigger("modify", "item", [att.parentItemID]);
          }
        }
      }
    } catch {
      // skip failures silently
    }
    pw.changeLine({
      text: getString("remove-progress", {
        args: {
          done: String(done),
          total: String(total),
          size: formatSize(totalBytes),
        },
      }),
      progress: Math.round(((done + 1) / total) * 100),
    });
  }

  pw.changeLine({
    text: getString("remove-complete", {
      args: {
        done: String(done),
        total: String(total),
        size: formatSize(totalBytes),
      },
    }),
    type: "success",
    progress: 100,
  });
  pw.startCloseTimer(5000);
}

// ── Unused hooks (required by template) ──────────────────────

async function onNotify(
  _event: string,
  _type: string,
  _ids: Array<string | number>,
  _extraData: { [key: string]: any },
) {}

async function onPrefsEvent(_type: string, _data: { [key: string]: any }) {}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
};
