// A release pins behavior as well as its visible screen tree. Dependency
// snapshots are encrypted and never included in client screen responses.
export async function captureDependencies(store, vault, appId, version) {
  const httpServices = Object.fromEntries(
    (
      await store.all(
        "SELECT id,config FROM http_services WHERE app_id=?",
        appId,
      )
    ).map((row) => [row.id, vault.open(row.config)]),
  );
  const functions = Object.fromEntries(
    (
      await store.all(
        "SELECT id,published_source FROM code_modules WHERE app_id=? AND kind='javascript' AND published_source IS NOT NULL",
        appId,
      )
    ).map((row) => [row.id, row.published_source]),
  );
  await store.run(
    "INSERT INTO release_dependencies VALUES(?,?,?)",
    appId,
    version,
    vault.seal({ httpServices, functions }),
  );
}
export async function releaseDependencies(store, vault, app) {
  if (!app.published) return undefined;
  const row = await store.one(
    "SELECT config FROM release_dependencies WHERE app_id=? AND version=?",
    app.id,
    app.published,
  );
  return row ? vault.open(row.config) : undefined;
}
