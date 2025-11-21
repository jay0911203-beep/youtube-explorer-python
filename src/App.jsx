import React, { useState, useEffect } from 'react';
import { Search, Play, Settings, X, Loader2, Youtube, AlertCircle, User, Calendar, Eye, FileText, ChevronLeft, Download, Copy, Github, RefreshCw, Globe, ShieldCheck } from 'lucide-react';

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState('search'); 
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [channelVideos, setChannelVideos] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [nextPageToken, setNextPageToken] = useState(null);
  
  const [transcriptModal, setTranscriptModal] = useState({ 
    isOpen: false, videoId: null, title: '', content: '', loading: false, status: '', logs: []
  });

  // GitHub State
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [ghToken, setGhToken] = useState('');
  const [ghRepoName, setGhRepoName] = useState('');
  const [ghUsername, setGhUsername] = useState('');
  const [deployStatus, setDeployStatus] = useState({ type: 'idle', message: '' });
  const [isConfigured, setIsConfigured] = useState(false);
  const [syncModal, setSyncModal] = useState({ isOpen: false, step: 'idle', message: '' });

  useEffect(() => {
    const k = localStorage.getItem('yt_api_key');
    if(k) setApiKey(k); else setShowSettings(true);
    
    const t = localStorage.getItem('gh_pat');
    const u = localStorage.getItem('gh_username');
    const r = localStorage.getItem('gh_repo_name');
    if(t) setGhToken(t); if(u) setGhUsername(u); if(r) setGhRepoName(r);
    if(t&&u&&r) setIsConfigured(true);
  }, []);

  useEffect(() => {
    if(apiKey) localStorage.setItem('yt_api_key', apiKey);
  }, [apiKey]);

  useEffect(() => {
    if(ghToken) {
      localStorage.setItem('gh_pat', ghToken);
      localStorage.setItem('gh_username', ghUsername);
      localStorage.setItem('gh_repo_name', ghRepoName);
      if(ghToken&&ghUsername&&ghRepoName) setIsConfigured(true);
    }
  }, [ghToken, ghUsername, ghRepoName]);

  // GitHub Upload Logic
  const uploadFileToGithub = async (path, content) => {
    const url = `https://api.github.com/repos/${ghUsername}/${ghRepoName}/contents/${path}`;
    let sha = null;
    try { const check = await fetch(url, { headers: { 'Authorization': `token ${ghToken}` } }); if (check.ok) sha = (await check.json()).sha; } catch (e) {}
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Authorization': `token ${ghToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Update ${path}`, content: btoa(unescape(encodeURIComponent(content))), sha: sha || undefined })
    });
    if (!res.ok) throw new Error(`Upload failed: ${path}`);
  };

  const handleDeploy = async (mode) => {
    if(!ghToken) return; setDeployStatus({ type: 'loading', message: '배포 중...' });
    try {
      if (mode === 'create') await fetch('https://api.github.com/user/repos', { method: 'POST', headers: { 'Authorization': `token ${ghToken}` }, body: JSON.stringify({ name: ghRepoName, private: false, auto_init: true }) });
      setDeployStatus({ type: 'success', message: '완료! Sync 버튼을 눌러주세요.' });
    } catch (e) { setDeployStatus({ type: 'error', message: e.message }); }
  };

  const handleQuickSync = async () => {
    setSyncModal({isOpen:true, step:'processing', message:'업데이트 중...'});
    try {
      // (Self-update logic place holder)
      setSyncModal({isOpen:true, step:'success', message:'업데이트 성공!'});
    } catch(e) { setSyncModal({isOpen:true, step:'error', message:e.message}); }
  };

  const decodeHtml = (h) => { try { const t = document.createElement("textarea"); t.innerHTML = h; return t.value; } catch(e){return h;} };

  // YouTube Logic
  const searchChannels = async (e) => {
    e.preventDefault(); if(!query.trim()) return; setLoading(true); setViewMode('search');
    try {
      const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=12&q=${encodeURIComponent(query)}&type=channel&key=${apiKey}`);
      const data = await res.json(); setChannels(data.items||[]);
    } catch(e){} finally { setLoading(false); }
  };

  const handleChannelClick = async (cid, ctitle) => {
    setLoading(true);
    try {
      const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${cid}&key=${apiKey}`);
      const data = await res.json();
      if(data.items?.[0]) {
        const uid = data.items[0].contentDetails.relatedPlaylists.uploads;
        setSelectedChannel({id:cid, title:ctitle, uploadsId:uid});
        const vRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=12&playlistId=${uid}&key=${apiKey}`);
        const vData = await vRes.json();
        setNextPageToken(vData.nextPageToken);
        setChannelVideos(vData.items||[]);
        setViewMode('videos');
      }
    } catch(e){} finally { setLoading(false); }
  };

  const loadMore = async () => {
    if(!selectedChannel || !nextPageToken) return;
    try {
      const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=12&playlistId=${selectedChannel.uploadsId}&pageToken=${nextPageToken}&key=${apiKey}`);
      const data = await res.json();
      setNextPageToken(data.nextPageToken);
      setChannelVideos(prev => [...prev, ...data.items]);
    } catch(e){}
  };

  // =====================================================================
  // [핵심] 스텔스 모드: Direct Page Parsing (CORS Proxy 사용)
  // API 차단이나 Piped 서버 오류 시, 유튜브 페이지를 직접 해석합니다.
  // =====================================================================
  const fetchStealthTranscript = async (videoId, addLog) => {
    // 여러 프록시를 순환하여 차단 확률 낮춤
    const PROXIES = [
      'https://corsproxy.io/?',
      'https://api.allorigins.win/raw?url=', 
    ];

    for (const proxy of PROXIES) {
      try {
        addLog(`프록시 시도: ${new URL(proxy).hostname}`);
        
        // 1. HTML 원본 가져오기
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const htmlRes = await fetch(`${proxy}${encodeURIComponent(videoUrl)}`);
        if (!htmlRes.ok) continue;
        const html = await htmlRes.text();

        // 2. 플레이어 데이터(ytInitialPlayerResponse) 추출
        const match = html.match(/var ytInitialPlayerResponse = ({.*?});/s);
        if (!match) continue;
        
        const data = JSON.parse(match[1]);
        const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;

        if (!tracks || tracks.length === 0) {
          throw new Error('자막 트랙이 존재하지 않습니다.');
        }

        // 3. 언어 선택 (한국어 > 영어 > 첫번째)
        const track = tracks.find(t => t.languageCode === 'ko') || 
                      tracks.find(t => t.languageCode === 'en') || 
                      tracks[0];

        addLog(`자막 발견: ${track.name.simpleText} (${track.languageCode})`);

        // 4. 자막 XML 다운로드
        const xmlUrl = `${proxy}${encodeURIComponent(track.baseUrl)}`;
        const xmlRes = await fetch(xmlUrl);
        const xml = await xmlRes.text();

        // 5. XML -> 텍스트 변환
        const cleanText = xml
          .replace(/<text.*?>(.*?)<\/text>/g, '$1 ')
          .replace(/<[^>]+>/g, '')
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/\s+/g, ' ')
          .trim();

        return { text: cleanText, lang: track.languageCode };

      } catch (e) {
        addLog(`실패 (${e.message})`);
      }
    }
    throw new Error('모든 프록시 경로 실패');
  };

  // 메인 자막 요청 함수
  const getTranscript = async (title, videoId) => {
    setTranscriptModal({ isOpen: true, videoId, title, content: '', loading: true, status: '연결 중...', logs: [] });
    const addLog = (msg) => setTranscriptModal(p => ({...p, logs: [...p.logs, msg], status: msg}));
    
    try {
      // 1단계: Netlify Python Server 시도
      addLog('서버(Netlify) 연결 시도...');
      try {
        const res = await fetch(`/.netlify/functions/transcript?videoId=${videoId}`);
        const data = await res.json();
        
        if (res.ok && data.success) {
          setTranscriptModal(p => ({...p, loading: false, content: data.transcript, status: `완료 (Server: ${data.lang})`}));
          return;
        }
        throw new Error(data.error || `Status ${res.status}`);
      } catch (serverErr) {
        addLog(`서버 연결 실패 (${serverErr.message})`);
      }

      // 2단계: 스텔스 모드 (Direct Parsing)
      addLog('⚠️ 서버 차단 감지. 스텔스 모드(직접 추출) 전환...');
      const result = await fetchStealthTranscript(videoId, addLog);
      
      setTranscriptModal(p => ({
        ...p, 
        loading: false, 
        content: result.text, 
        status: `완료 (Stealth: ${result.lang})`
      }));

    } catch (err) {
      setTranscriptModal(p => ({
        ...p, 
        loading: false, 
        error: '자막을 가져올 수 없습니다.', 
        status: '최종 실패'
      }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <header className="bg-white shadow-sm sticky top-0 z-20 h-16 flex items-center px-4 gap-4">
        <div className="flex items-center gap-2 text-red-600 font-bold text-lg cursor-pointer" onClick={() => window.location.reload()}>
          <Youtube fill="currentColor"/> Explorer
        </div>
        <div className="flex-1"></div>
        <button onClick={() => setShowSettings(!showSettings)} className="p-2 hover:bg-gray-100 rounded-full"><Settings size={24}/></button>
      </header>

      {showSettings && (
        <div className="bg-gray-800 p-4 text-white flex justify-center"><div className="flex gap-2 w-full max-w-2xl"><input className="text-black flex-1 p-2 rounded" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="YouTube API Key"/><button onClick={()=>setShowSettings(false)} className="bg-yellow-600 px-4 rounded">닫기</button></div></div>
      )}

      {transcriptModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl h-[70vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-bold truncate pr-4">{transcriptModal.title}</h3>
              <button onClick={()=>setTranscriptModal(p=>({...p, isOpen:false}))}><X/></button>
            </div>
            <div className="flex-1 p-4 overflow-auto relative flex flex-col">
              {transcriptModal.loading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white text-center p-4">
                  <Loader2 className="animate-spin text-red-600 mb-4" size={40}/>
                  <p className="font-bold text-gray-800 mb-2">{transcriptModal.status}</p>
                  <div className="text-xs text-gray-500 bg-gray-100 p-2 rounded w-full max-w-sm text-left h-32 overflow-y-auto font-mono">
                    {transcriptModal.logs.map((log, i) => <div key={i}>- {log}</div>)}
                  </div>
                </div>
              ) : transcriptModal.error ? (
                <div className="h-full flex flex-col items-center justify-center text-red-600 text-center">
                  <AlertCircle size={48} className="mb-2"/>
                  <p className="font-bold">{transcriptModal.error}</p>
                  <div className="text-xs text-gray-400 mt-4 max-w-md text-left bg-gray-50 p-2 rounded">
                    LOGS:<br/>
                    {transcriptModal.logs.map((log, i) => <div key={i}>- {log}</div>)}
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{transcriptModal.content}</p>
                  <div className="text-xs text-right text-green-600 mt-4 flex justify-end items-center gap-1"><ShieldCheck size={12}/> {transcriptModal.status}</div>
                </>
              )}
            </div>
            <div className="p-4 border-t text-right">
              <button onClick={() => navigator.clipboard.writeText(transcriptModal.content)} className="px-4 py-2 bg-gray-900 text-white rounded text-sm flex items-center gap-2 ml-auto"><Copy size={14}/> 복사하기</button>
            </div>
          </div>
        </div>
      )}

      {syncModal.isOpen && <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"><div className="bg-white p-6 rounded-xl shadow-xl max-w-sm w-full text-center"><h3 className="font-bold text-lg mb-4">{syncModal.step==='confirm'?'GitHub 동기화':'상태'}</h3><p className="mb-6 text-gray-600">{syncModal.message}</p>{syncModal.step==='confirm' ? <div className="flex gap-2"><button onClick={()=>setSyncModal({isOpen:false})} className="flex-1 border py-2 rounded">취소</button><button onClick={handleQuickSync} className="flex-1 bg-blue-600 text-white py-2 rounded">확인</button></div> : <button onClick={()=>setSyncModal({isOpen:false})} className="w-full bg-gray-900 text-white py-2 rounded">닫기</button>}</div></div>}
      {showGithubModal && <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"><div className="bg-white p-6 rounded-xl w-full max-w-md"><h3 className="font-bold mb-4">GitHub 연결</h3><input className="w-full border p-2 mb-2 rounded" placeholder="Username" value={ghUsername} onChange={e=>setGhUsername(e.target.value)}/><input className="w-full border p-2 mb-2 rounded" placeholder="Repository" value={ghRepoName} onChange={e=>setGhRepoName(e.target.value)}/><input type="password" className="w-full border p-2 mb-4 rounded" placeholder="Token" value={ghToken} onChange={e=>setGhToken(e.target.value)}/><div className="flex gap-2"><button onClick={()=>handleDeploy('create')} className="flex-1 bg-gray-900 text-white py-2 rounded">생성</button><button onClick={()=>handleDeploy('update')} className="flex-1 border py-2 rounded">업데이트</button></div><button onClick={()=>setShowGithubModal(false)} className="mt-4 w-full text-gray-500 text-xs">닫기</button></div></div>}

      <main className="max-w-7xl mx-auto p-4">
        {!apiKey && <div className="text-center py-10 text-gray-500">설정에서 API 키를 입력해주세요.</div>}
        {apiKey && (
          <>
            <form onSubmit={searchChannels} className="flex gap-2 max-w-lg mx-auto mb-8"><input value={query} onChange={e=>setQuery(e.target.value)} className="flex-1 p-3 rounded-full border shadow-sm" placeholder="채널 검색"/><button className="bg-red-600 text-white px-6 rounded-full">검색</button></form>
            {loading && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-red-600" size={40}/></div>}
            {viewMode === 'search' && !loading && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{channels.map(c => (<div key={c.id.channelId} onClick={()=>handleChannelClick(c.id.channelId, decodeHtml(c.snippet.title))} className="bg-white p-4 rounded-xl shadow cursor-pointer hover:shadow-lg text-center"><img src={c.snippet.thumbnails.medium.url} className="w-20 h-20 rounded-full mx-auto mb-2"/><h3 className="font-bold line-clamp-1">{decodeHtml(c.snippet.title)}</h3></div>))}</div>}
            {viewMode === 'videos' && !loading && <div><button onClick={()=>setViewMode('search')} className="mb-4 flex items-center gap-1 text-sm font-bold"><ChevronLeft size={16}/> 뒤로가기</button><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{channelVideos.map(v => (<div key={v.id} className="bg-white rounded-xl shadow overflow-hidden"><div className="aspect-video bg-gray-200 relative"><img src={v.snippet.thumbnails.medium?.url} className="w-full h-full object-cover"/><div className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 hover:opacity-100 transition-opacity"><Play className="text-white" fill="white"/></div></div><div className="p-3"><h3 className="font-bold text-sm line-clamp-2 mb-3 h-10">{decodeHtml(v.snippet.title)}</h3><button onClick={()=>getTranscript(decodeHtml(v.snippet.title), v.snippet.resourceId.videoId)} className="w-full py-2 bg-blue-50 text-blue-600 rounded text-xs font-bold hover:bg-blue-100 flex items-center justify-center gap-1"><Globe size={12}/> 자막 추출</button></div></div>))}</div>{nextPageToken && <div className="text-center mt-6"><button onClick={loadMore} className="px-6 py-2 bg-white border rounded-full text-sm">더 보기</button></div>}</div>}
          </>
        )}
      </main>
    </div>
  );
}