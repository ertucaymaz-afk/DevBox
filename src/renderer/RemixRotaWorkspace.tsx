import { Eye, EyeOff, Heart, Library, ListMusic, LoaderCircle, Music2, Pause, Play, RefreshCw, Search, Settings2, SkipBack, SkipForward, Speaker, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { RemixRotaLibraryView, RemixRotaStatus, RemixRotaTrack } from "../shared/remixrota-contracts";

function failure(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/^Error invoking remote method '[^']+':\s*/iu, "");
  return String(error);
}
function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const value = Math.floor(seconds);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}
function stateLabel(state: RemixRotaStatus["state"]): string {
  return ({ UNCONFIGURED: "YAPILANDIRILMADI", DISCOVERED: "KEŞFEDİLDİ", CONNECTING: "BAĞLANIYOR", READY: "BAĞLI", DEGRADED: "BAĞLANTI KOPTU", FAILED: "BAŞARISIZ" } as const)[state];
}

function TrackRow({ track, current, onPlay }: { track: RemixRotaTrack; current: boolean; onPlay: (track: RemixRotaTrack) => void }): ReactNode {
  return <button className={`music-track-row ${current ? "current" : ""}`} onClick={() => onPlay(track)}>
    <span className="music-cover-mini">{track.thumbnailUrl ? <img src={track.thumbnailUrl} alt="" referrerPolicy="no-referrer" /> : <Music2 size={16} />}</span>
    <span className="music-track-copy"><strong>{track.title}</strong><small>{track.artist} · {track.source}</small></span>
    <span className="music-track-duration">{track.durationText ?? ""}</span>
    <Play size={13} aria-hidden="true" />
  </button>;
}

export function RemixRotaWorkspace(): ReactNode {
  const [status, setStatus] = useState<RemixRotaStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchView, setSearchView] = useState<RemixRotaLibraryView | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    try { setStatus(await window.devbox.inspectRemixRota()); }
    catch (caught) { setError(failure(caught)); }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => window.devbox.onRemixRotaEvent(() => { void reload(); }), [reload]);

  const invoke = async (command: Parameters<typeof window.devbox.invokeRemixRota>[0], argumentsValue: Record<string, unknown> = {}): Promise<unknown> => {
    setBusy(command); setError(null);
    try {
      const result = await window.devbox.invokeRemixRota(command, argumentsValue);
      await reload();
      return result.result;
    } catch (caught) { setError(failure(caught)); return null; }
    finally { setBusy(null); }
  };
  const connect = async (): Promise<void> => {
    setBusy("connect"); setError(null);
    try { setStatus(await window.devbox.connectRemixRota()); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const configure = async (): Promise<void> => {
    setBusy("configure"); setError(null);
    try { setStatus(await window.devbox.selectRemixRotaExecutable()); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const disconnect = async (): Promise<void> => {
    setBusy("disconnect"); setError(null);
    try { setStatus(await window.devbox.disconnectRemixRota()); }
    catch (caught) { setError(failure(caught)); }
    finally { setBusy(null); }
  };
  const search = async (): Promise<void> => {
    const term = query.trim();
    if (term.length < 2) return;
    const result = await invoke("library.search", { query: term });
    if (result && typeof result === "object") setSearchView(result as RemixRotaLibraryView);
  };
  const playTrack = (track: RemixRotaTrack): void => { void invoke("player.playTrack", { videoId: track.videoId }); };

  const player = status?.player ?? null;
  const view = searchView ?? status?.library ?? null;
  const progress = player?.duration ? Math.max(0, Math.min(100, (player.progress / player.duration) * 100)) : 0;
  const state = status?.state ?? "UNCONFIGURED";
  const ready = state === "READY";
  const currentTitle = player?.current?.title ?? "RemixRota bağlantısı bekleniyor";
  const currentArtist = player?.current?.artist ?? "DevBox müzik motorunu kopyalamaz; gerçek companion durumunu gösterir.";
  const tracks = useMemo(() => view?.tracks ?? [], [view]);

  return <section className="advanced-page music-workspace">
    <div className="advanced-heading music-heading"><div><span className="advanced-eyebrow">REMIXROTA COMPANION · PROTOCOL 1.0</span><h1>Müzik merkezi</h1><p>Oynatma durumunun tek sahibi RemixRota. DevBox yalnız dar izinli Windows named-pipe protokolünden okur ve desteklenen komutları gönderir; ayrı müzik state’i uydurmaz.</p></div><div className="advanced-actions"><button onClick={() => void reload()} disabled={Boolean(busy)}><RefreshCw className={busy ? "spin" : ""} size={14} /> Yenile</button><button onClick={() => void configure()} disabled={Boolean(busy)}><Settings2 size={14} /> RemixRota.exe seç</button>{ready ? <button onClick={() => void disconnect()} disabled={Boolean(busy)}>Bağlantıyı kes</button> : <button className="primary flame" onClick={() => void connect()} disabled={Boolean(busy)}>{busy === "connect" ? <LoaderCircle className="spin" size={14} /> : <Music2 size={14} />} Companion'a bağlan</button>}</div></div>

    <div className="music-status-grid">
      <article className={`music-connection-card state-${state.toLocaleLowerCase("en-US")}`}><span>BAĞLANTI</span><strong>{stateLabel(state)}</strong><small>{status?.detail ?? "Yerel entegrasyon okunuyor."}</small></article>
      <article><span>PROTOKOL</span><strong>{status?.discovery ? `${status.discovery.protocol.major}.${status.discovery.protocol.minor}` : "1.0"}</strong><small>{status?.discovery?.serviceVersion ? `RemixRota ${status.discovery.serviceVersion}` : "companion discovery"}</small></article>
      <article><span>YETENEK</span><strong>{status?.grantedCapabilities.length ?? 0}/5</strong><small>{status?.grantedCapabilities.join(" · ") || "el sıkışması bekleniyor"}</small></article>
      <article><span>KUYRUK</span><strong>{player?.queueCount ?? 0}</strong><small>{player?.activeView ?? "görünüm yok"}</small></article>
    </div>

    <section className="music-now-playing">
      <div className="music-artwork">{player?.current?.thumbnailUrl ? <img src={player.current.thumbnailUrl} alt={`${currentTitle} kapağı`} referrerPolicy="no-referrer" /> : <Music2 size={38} />}</div>
      <div className="music-now-copy"><span>ŞİMDİ ÇALIYOR</span><h2>{currentTitle}</h2><p>{currentArtist}</p><div className="music-progress"><button className="music-seek" aria-label="Parçada konum seç" disabled={!ready || !player?.duration} onClick={(event) => { if (!player?.duration) return; const box = event.currentTarget.getBoundingClientRect(); const ratio = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)); void invoke("player.seek", { seconds: player.duration * ratio }); }}><i style={{ width: `${progress}%` }} /></button><small>{duration(player?.progress ?? 0)} / {duration(player?.duration ?? 0)}</small></div></div>
      <div className="music-controls"><button onClick={() => void invoke("player.previous")} disabled={!ready}><SkipBack size={18} /></button><button className="music-play" onClick={() => void invoke(player?.isPlaying ? "player.pause" : "player.play")} disabled={!ready}>{busy?.startsWith("player.") ? <LoaderCircle className="spin" size={21} /> : player?.isPlaying ? <Pause size={22} /> : <Play size={22} />}</button><button onClick={() => void invoke("player.next")} disabled={!ready}><SkipForward size={18} /></button><button className={player?.isFavorite ? "selected" : ""} onClick={() => void invoke("player.toggleFavorite")} disabled={!ready || !player?.current}><Heart size={18} fill={player?.isFavorite ? "currentColor" : "none"} /></button></div>
      <label className="music-volume"><Volume2 size={16} /><input type="range" min="0" max="100" value={player?.volume ?? 0} disabled={!ready} onChange={(event) => { const value = Number(event.target.value); setStatus((current) => current?.player ? { ...current, player: { ...current.player, volume: value } } : current); }} onPointerUp={(event) => void invoke("player.setVolume", { value: Number((event.currentTarget as HTMLInputElement).value) })} /><span>{Math.round(player?.volume ?? 0)}%</span></label>
      <div className="music-window-actions"><button onClick={() => void invoke("app.show")} disabled={!ready}><Eye size={14} /> RemixRota'yı göster</button><button onClick={() => void invoke("app.hide")} disabled={!ready}><EyeOff size={14} /> Gizle</button></div>
    </section>

    <section className="music-library-panel"><header><div><Library size={18} /><div><span className="advanced-eyebrow">CANLI KÜTÜPHANE</span><h2>{view?.title ?? "RemixRota görünümü"}</h2><p>{view?.subtitle ?? "Bağlantı kurulduğunda gerçek görünüm burada listelenir."}</p></div></div><label className="music-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} placeholder="RemixRota içinde ara…" /><button onClick={() => void search()} disabled={!ready || query.trim().length < 2 || busy === "library.search"}>{busy === "library.search" ? <LoaderCircle className="spin" size={14} /> : "Ara"}</button></label></header><div className="music-track-list">{tracks.length ? tracks.map((track) => <TrackRow key={track.videoId} track={track} current={track.videoId === player?.current?.videoId} onPlay={playTrack} />) : <div className="advanced-empty compact"><ListMusic size={23} /><strong>Canlı parça listesi yok</strong><span>{ready ? "Kütüphane görünümünü yenileyin veya arama yapın." : "Companion bağlantısı kurulduktan sonra gerçek liste yüklenir."}</span></div>}</div></section>

    <section className="music-integration-trust"><Speaker size={17} /><div><strong>Yerel ve sınırlı entegrasyon</strong><span>DevBox yalnız RemixRota companion discovery + named pipe yüzeyine bağlanır. Komut listesi allowlist'tir; renderer'a raw socket, shell veya ipcRenderer verilmez.</span></div><code>{status?.discovery?.pipeName ?? "remixrota-companion-v1"}</code></section>
    {error && <div className="inline-error music-error">{error}</div>}
  </section>;
}
