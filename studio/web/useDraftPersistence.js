import { useEffect, useRef, useState } from "react";
export const recoveryKey = (account, appId) =>
  `spacewidget:draft:${account?.email || ""}:${appId}`;
export function readRecovery(account, appId) {
  try {
    return JSON.parse(
      localStorage.getItem(recoveryKey(account, appId)) || "null",
    );
  } catch {
    return null;
  }
}
export function useDraftPersistence({
  account,
  app,
  doc,
  dirty,
  save,
  notify,
}) {
  const latestSave = useRef(save);
  latestSave.current = save;
  const [status, setStatus] = useState("saved");
  const failedRevision = useRef(null);
  useEffect(() => {
    failedRevision.current = null;
    setStatus("saved");
  }, [app?.id]);
  useEffect(() => {
    if (!account || !app || !doc) return;
    const key = recoveryKey(account, app.id);
    try {
      if (dirty)
        localStorage.setItem(
          key,
          JSON.stringify({
            revision: app.revision,
            document: doc,
            updated: new Date().toISOString(),
          }),
        );
      else {
        const recovery = readRecovery(account, app.id);
        if (
          !recovery ||
          recovery.revision === app.revision ||
          JSON.stringify(recovery.document) === JSON.stringify(doc)
        )
          localStorage.removeItem(key);
      }
    } catch {
      if (dirty) setStatus("local-storage-full");
    }
    if (!dirty) {
      setStatus("saved");
      return;
    }
    const fingerprint = `${app.id}:${app.revision}:${JSON.stringify(doc)}`;
    if (failedRevision.current === fingerprint) return;
    setStatus("pending");
    const timer = setTimeout(async () => {
      setStatus("saving");
      try {
        await latestSave.current();
        setStatus("saved");
      } catch (error) {
        failedRevision.current = fingerprint;
        setStatus("failed");
        notify(
          `Draft not saved: ${error.message} Your recovery copy is kept in this browser.`,
          true,
        );
      }
    }, 1600);
    return () => clearTimeout(timer);
  }, [account?.email, app?.id, app?.revision, doc, dirty]);
  useEffect(() => {
    const leave = (event) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  return status;
}
