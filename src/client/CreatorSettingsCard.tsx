import { useEffect, useMemo, useState } from "react";
import { IconChevronDownOutline14 } from "@deepseek-ai/dsh-client-ui-primitives";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";

import {
  AUTO_DRAFT_PLATFORMS,
  draftCapability,
  normalizeEnabledPlatforms,
  PUBLISH_PLATFORM_DEFINITIONS,
  PUBLISH_PLATFORMS,
  type PlatformKind,
} from "../platforms.ts";
import type {
  CreatorCapabilities,
  CreatorProfile,
  PlatformAccount,
  PublishPlatform,
} from "../types.ts";
import type { CreatorViewFace } from "./face.ts";
import type { CreatorKey } from "./locales.ts";
import { CONTENT_WORKBENCH_ICON_SRC } from "./assets/contentWorkbenchIcon.ts";
import { ActionBar, ActionButton } from "./ui/ActionButton.tsx";
import { StatusPill, type StatusTone } from "./ui/StatusPill.tsx";
import "./CreatorSettingsCard.css";

export type CreatorSettingsCardProps =
  & PropsRuntime<"settings.plugin.item">
  & PropsLocale<"dsh.oil.creator">
  & InjectFace<Pick<
    CreatorViewFace,
    | "ready"
    | "getSettings"
    | "getCapabilities"
    | "setLibraryRoot"
    | "setProfile"
    | "pickDirectory"
    | "getPlatformAccounts"
    | "openPlatformAccount"
    | "checkPlatformAccount"
  >>;

const EMPTY_PROFILE: CreatorProfile = { enabledPlatforms: [...AUTO_DRAFT_PLATFORMS] };

const CAPABILITY_ROWS: ReadonlyArray<{ id: keyof CreatorCapabilities; label: CreatorKey }> = [
  { id: "library", label: "settings.capability.library" },
  { id: "autoPublish", label: "settings.capability.publish" },
  { id: "article", label: "settings.capability.article" },
  { id: "egoBrowser", label: "settings.capability.ego" },
];

const ACCOUNT_GROUPS: ReadonlyArray<{ kind: PlatformKind; label: CreatorKey }> = [
  { kind: "video", label: "settings.account.video" },
  { kind: "article", label: "settings.account.article" },
  { kind: "audio", label: "settings.account.audio" },
];

function capabilityTone(state: CreatorCapabilities[keyof CreatorCapabilities]["state"]): StatusTone {
  return state === "ready" ? "success" : "neutral";
}

function capabilityStateKey(
  state: CreatorCapabilities[keyof CreatorCapabilities]["state"],
): CreatorKey {
  if (state === "ready") return "settings.state.ready";
  if (state === "unsupported") return "settings.state.unsupported";
  return "settings.state.missing";
}

function cloneProfile(profile: CreatorProfile): CreatorProfile {
  return { enabledPlatforms: [...profile.enabledPlatforms] };
}

function sameProfile(left: CreatorProfile, right: CreatorProfile): boolean {
  return left.enabledPlatforms.length === right.enabledPlatforms.length
    && left.enabledPlatforms.every((platform, index) =>
      platform === right.enabledPlatforms[index]
    );
}

function accountTone(status: PlatformAccount["status"]): StatusTone {
  if (status === "active") return "success";
  if (status === "expired") return "error";
  return "neutral";
}

function accountLabel(status: PlatformAccount["status"], t: (key: CreatorKey) => string): string {
  if (status === "active") return t("settings.account.active");
  if (status === "expired") return t("settings.account.expired");
  return t("settings.account.unknown");
}

type AccountAction = "open" | "check";

function accountAction(account: Pick<PlatformAccount, "status" | "taskSpace">): AccountAction {
  return account.taskSpace !== undefined || account.status === "active" ? "check" : "open";
}

function accountActionKey(
  account: Pick<PlatformAccount, "status" | "taskSpace">,
  busy: boolean,
): CreatorKey {
  if (busy) return "settings.account.action.working";
  if (account.taskSpace !== undefined) return "settings.account.action.finish";
  if (account.status === "active") return "settings.account.action.recheck";
  if (account.status === "expired") return "settings.account.action.relogin";
  return "settings.account.action.login";
}

export function CreatorSettingsCard({
  t,
  ready,
  getSettings,
  setLibraryRoot,
  setProfile,
  pickDirectory,
  getCapabilities,
  getPlatformAccounts,
  openPlatformAccount,
  checkPlatformAccount,
}: CreatorSettingsCardProps) {
  const [open, setOpen] = useState(false);
  const [savedRoot, setSavedRoot] = useState("");
  const [draftRoot, setDraftRoot] = useState("");
  const [savedProfile, setSavedProfile] = useState<CreatorProfile>(EMPTY_PROFILE);
  const [draftProfile, setDraftProfile] = useState<CreatorProfile>(EMPTY_PROFILE);
  const [capabilities, setCapabilities] = useState<CreatorCapabilities>();
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [accountBusy, setAccountBusy] = useState<PublishPlatform>();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string>();
  const [saved, setSaved] = useState(false);

  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [account.platform, account])),
    [accounts],
  );

  useEffect(() => {
    if (!ready()) return;
    let cancelled = false;
    void getSettings().then((settings) => {
      if (cancelled) return;
      setSavedRoot(settings.libraryRoot);
      setDraftRoot(settings.libraryRoot);
      setSavedProfile(cloneProfile(settings.profile));
      setDraftProfile(cloneProfile(settings.profile));
    }, () => undefined);
    return () => { cancelled = true; };
  }, [ready, getSettings]);

  useEffect(() => {
    if (!open || !ready()) return;
    let cancelled = false;
    void Promise.all([getCapabilities(), getPlatformAccounts()]).then(
      ([nextCapabilities, nextAccounts]) => {
        if (cancelled) return;
        setCapabilities(nextCapabilities);
        setAccounts(nextAccounts.accounts);
      },
      () => undefined,
    );
    return () => { cancelled = true; };
  }, [open, ready, getCapabilities, getPlatformAccounts]);

  const dirtyRoot = draftRoot !== savedRoot;
  const dirtyProfile = !sameProfile(draftProfile, savedProfile);
  const dirty = dirtyRoot || dirtyProfile;
  const title = t("settings.title");

  const onPick = async () => {
    const path = await pickDirectory();
    if (path !== null) setDraftRoot(path);
    setSaved(false);
    setFailed(undefined);
  };

  const patchProfile = (platform: PublishPlatform, enabled: boolean) => {
    setDraftProfile((current) => ({
      enabledPlatforms: normalizeEnabledPlatforms(enabled
        ? [...current.enabledPlatforms, platform]
        : current.enabledPlatforms.filter((item) => item !== platform)),
    }));
    setSaved(false);
  };

  const onSave = async () => {
    if (!dirty || saving || (dirtyRoot && draftRoot === "")) return;
    setSaving(true);
    setFailed(undefined);
    try {
      if (dirtyRoot) {
        await setLibraryRoot(draftRoot);
        setSavedRoot(draftRoot);
      }
      if (dirtyProfile) {
        await setProfile(draftProfile);
        setSavedProfile(cloneProfile(draftProfile));
      }
      setSaved(true);
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : t("settings.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const runAccountAction = async (platform: PublishPlatform, action: AccountAction) => {
    setAccountBusy(platform);
    setFailed(undefined);
    try {
      if (action === "open") {
        await openPlatformAccount(platform);
        setAccounts((await getPlatformAccounts()).accounts);
      } else {
        setAccounts((await checkPlatformAccount(platform)).accounts);
      }
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : t("settings.account.failed"));
    } finally {
      setAccountBusy(undefined);
    }
  };

  const renderAccount = (platform: PublishPlatform) => {
    const definition = PUBLISH_PLATFORM_DEFINITIONS[platform];
    const account = accountMap.get(platform) ?? {
      platform,
      status: "unknown" as const,
      supportsAutoDraft: false,
      draftCapability: draftCapability(platform),
    };
    const enabled = draftProfile.enabledPlatforms.includes(platform);
    const action = accountAction(account);
    return (
      <div key={platform} className="accountRow" data-platform-kind={definition.kind}>
        <label className="accountMain">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!account.supportsAutoDraft}
            onChange={(event) => { patchProfile(platform, event.target.checked); }}
          />
          <span className="accountName">
            {definition.name}
            <small>{account.draftCapability === "remote-verified"
              ? t("settings.account.remoteVerified")
              : account.draftCapability === "implemented-simulated"
                ? t("settings.account.simulated")
                : account.draftCapability === "page-ready"
                  ? t("settings.account.pageReady")
                  : t("settings.account.bindingOnly")}</small>
          </span>
        </label>
        <StatusPill tone={accountTone(account.status)}>
          {accountLabel(account.status, t)}
        </StatusPill>
        <div className="accountActions">
          <ActionButton
            disabled={accountBusy !== undefined}
            onClick={() => { void runAccountAction(platform, action); }}
          >
            {t(accountActionKey(account, accountBusy === platform))}
          </ActionButton>
        </div>
      </div>
    );
  };

  return (
    <li data-plugin="dsh-oil-creator" data-surface="settings-card" className={open ? "card open" : "card"}>
      <button
        type="button"
        className="header"
        aria-expanded={open}
        aria-label={`${t(open ? "settings.collapse" : "settings.expand")}: ${title}`}
        onClick={() => { setOpen(!open); }}
      >
        <img
          className="settingsIcon"
          src={CONTENT_WORKBENCH_ICON_SRC}
          alt=""
          aria-hidden="true"
        />
        <span className="headText">
          <span className="name">{title}</span>
          <span className="description">{t("settings.description")}</span>
        </span>
        {dirty && <span className="pending">{t("settings.save")}</span>}
        <IconChevronDownOutline14 className={open ? "chevron open" : "chevron"} />
      </button>
      {open && (
        <div className="body">
          {capabilities !== undefined && (
            <div className="field capabilityField">
              <span className="fieldLabel">{t("settings.capabilities")}</span>
              <span className="fieldHint">{t("settings.capabilitiesHint")}</span>
              <div className="capabilityGrid">
                {CAPABILITY_ROWS.map((row) => {
                  const item = capabilities[row.id];
                  return (
                    <span key={row.id} className="capabilityItem" title={item.detail}>
                      <span className="capabilityName">{t(row.label)}</span>
                      <StatusPill tone={capabilityTone(item.state)}>
                        {t(capabilityStateKey(item.state))}
                      </StatusPill>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          <label className="field libraryField">
            <span className="fieldLabel">{t("settings.libraryRoot")}</span>
            <span className="fieldHint">{t("settings.libraryRootHint")}</span>
            <span className="pathRow">
              <span className={draftRoot === "" ? "path empty" : "path"}>
                {draftRoot === "" ? t("settings.libraryRootEmpty") : draftRoot}
              </span>
              <ActionButton onClick={() => { void onPick(); }}>
                {t("settings.pick")}
              </ActionButton>
            </span>
          </label>
          <div className="field accountsField">
            <span className="fieldLabel">{t("settings.accounts")}</span>
            <span className="fieldHint">{t("settings.accountsHint")}</span>
            <div className="accountGroups">
              {ACCOUNT_GROUPS.map(({ kind, label }) => {
                const platforms = PUBLISH_PLATFORMS.filter((platform) =>
                  PUBLISH_PLATFORM_DEFINITIONS[platform].kind === kind
                );
                return (
                  <section key={kind} className={`accountGroup ${kind}Group`}>
                    <header className="accountGroupHead">
                      <span>{t(label)}</span>
                      <strong>{String(platforms.length).padStart(2, "0")}</strong>
                    </header>
                    <div className="accountList">{platforms.map(renderAccount)}</div>
                  </section>
                );
              })}
            </div>
          </div>
          <div className="footer">
            {failed !== undefined && <p className="failed">{failed}</p>}
            {saved && failed === undefined && <p className="ok">{t("settings.saved")}</p>}
            <ActionBar>
              <ActionButton
                disabled={!dirty || saving}
                onClick={() => {
                  setDraftRoot(savedRoot);
                  setDraftProfile(cloneProfile(savedProfile));
                  setFailed(undefined);
                  setSaved(false);
                }}
              >
                {t("settings.discard")}
              </ActionButton>
              <ActionButton
                tone="primary"
                disabled={!dirty || saving || (dirtyRoot && draftRoot === "")}
                onClick={() => { void onSave(); }}
              >
                {t(saving ? "settings.saving" : "settings.save")}
              </ActionButton>
            </ActionBar>
          </div>
        </div>
      )}
    </li>
  );
}
