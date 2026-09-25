export function npmSourceIdentity(pkg) {
  if (!pkg?.npm) return null;
  const profile = pkg.profiles?.find((entry) => entry.id === pkg.npm.profile);
  return {
    releaseTag: pkg.npm.source?.releaseTag || pkg.release?.tag || null,
    releaseAsset: pkg.npm.source?.releaseAsset || profile?.releaseAsset || null,
    upstreamVersion: pkg.npm.source?.upstreamVersion || pkg.upstream?.version || null,
    builderVersion: pkg.npm.source?.builderVersion || pkg.zoo?.builderVersion || null,
    commit: pkg.npm.source?.commit || null
  };
}

export function classifyNpmDistribution(pkg, config, registry = {}) {
  if (!pkg?.npm) return { state: "na", label: "No npm distribution", updatePending: false };

  const npm = pkg.npm;
  const source = npmSourceIdentity(pkg);
  const expectedVersion = npm.version || null;
  const expectedName = npm.package || null;
  const currentReleaseTag = pkg.release?.tag || null;
  const sourceCurrent = Boolean(source?.releaseTag && currentReleaseTag && source.releaseTag === currentReleaseTag);
  const intentionalPin = Boolean(config?.keepNpmPinned && !sourceCurrent);
  const registryAvailable = registry.available !== false;
  const registryHasExpected = Boolean(registry.expectedVersion);
  const registryLatest = registry.latestVersion || null;
  const registryShasum = registry.shasum || null;
  const recordedShasum = npm.registryShasum || null;
  const shasumMatch = recordedShasum && registryShasum ? recordedShasum === registryShasum : null;

  const base = {
    package: expectedName,
    expectedVersion,
    registryVersion: registryHasExpected ? registry.expectedVersion : null,
    registryLatest,
    registryShasum,
    recordedShasum,
    shasumMatch,
    sourceReleaseTag: source?.releaseTag || null,
    sourceReleaseAsset: source?.releaseAsset || null,
    packageReleaseTag: currentReleaseTag,
    sourceCurrent,
    intentionalPin,
    updatePending: false
  };

  if (npm.status !== "published") {
    return { ...base, state: "pending", label: "npm not published", updatePending: true };
  }
  if (!registryAvailable) {
    return { ...base, state: "unknown", label: "Registry check unavailable", updatePending: !sourceCurrent };
  }
  if (!registryHasExpected) {
    return { ...base, state: "pending", label: `Registry update pending (${expectedVersion})`, updatePending: true };
  }
  if (recordedShasum && registryShasum && !shasumMatch) {
    return { ...base, state: "error", label: "Registry SHA-1 mismatch", updatePending: true };
  }
  if (!sourceCurrent) {
    if (intentionalPin) {
      return {
        ...base,
        state: "warn",
        label: `Pinned to ${source.releaseTag}`,
        updatePending: true,
        review: "separate-npm-review"
      };
    }
    return {
      ...base,
      state: "error",
      label: `Source release drift (${source?.releaseTag || "unknown"})`,
      updatePending: true
    };
  }
  if (registryLatest && expectedVersion && registryLatest !== expectedVersion) {
    return {
      ...base,
      state: "warn",
      label: `Registry latest is ${registryLatest}`,
      updatePending: true,
      review: "registry-ahead"
    };
  }

  return { ...base, state: "ok", label: `Published ${expectedVersion}`, updatePending: false };
}

export async function fetchNpmRegistryDistribution(pkg, fetchImpl = fetch) {
  const name = pkg?.npm?.package;
  const version = pkg?.npm?.version;
  if (!name || !version) return { available: false, error: "npm package/version missing" };
  const encodedName = encodeURIComponent(name);
  const headers = { Accept: "application/json", "User-Agent": "wasm-zoo-release-health" };
  try {
    const [exactResponse, latestResponse] = await Promise.all([
      fetchImpl(`https://registry.npmjs.org/${encodedName}/${encodeURIComponent(version)}`, { headers }),
      fetchImpl(`https://registry.npmjs.org/${encodedName}/latest`, { headers })
    ]);
    let exact = null;
    let latest = null;
    if (exactResponse.ok) exact = await exactResponse.json();
    else if (exactResponse.status !== 404) throw new Error(`exact npm lookup: ${exactResponse.status} ${exactResponse.statusText}`);
    if (latestResponse.ok) latest = await latestResponse.json();
    else if (latestResponse.status !== 404) throw new Error(`latest npm lookup: ${latestResponse.status} ${latestResponse.statusText}`);
    return {
      available: true,
      expectedVersion: exact?.version || null,
      latestVersion: latest?.version || null,
      shasum: exact?.dist?.shasum || null,
      integrity: exact?.dist?.integrity || null,
      tarball: exact?.dist?.tarball || null
    };
  } catch (error) {
    return { available: false, error: error.message };
  }
}
