import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const ADMIN_PASSWORD = 'Giovannilucadavighignolo';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [activeTab, setActiveTab] = useState('upload');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');

  const [settings, setSettings] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [userVotes, setUserVotes] = useState([]);
  const [whitelist, setWhitelist] = useState([]);
  const [allVotes, setAllVotes] = useState([]);
  
  const [teamName, setTeamName] = useState('');
  const [file, setFile] = useState(null);
  
  const [newEmail, setNewEmail] = useState('');
  const [uploadDeadlineInput, setUploadDeadlineInput] = useState('');
  const [voteDeadlineInput, setVoteDeadlineInput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('hqe_contest_user');
    if (savedUser) {
      const userData = JSON.parse(savedUser);
      setCurrentUser(userData);
      setIsAdmin(userData.is_admin);
    }
    fetchSettings();
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchPhotos();
      fetchUserVotes();
      if (currentUser.is_admin) {
        fetchWhitelist();
        fetchAllVotes();
      }
    }
  }, [currentUser]);

  const fetchSettings = async () => {
    const { data } = await supabase.from('contest_settings').select('*').single();
    if (data) {
      setSettings(data);
      setUploadDeadlineInput(new Date(data.upload_deadline).toISOString().slice(0, 16));
      setVoteDeadlineInput(new Date(data.vote_deadline).toISOString().slice(0, 16));
    }
  };

  const fetchPhotos = async () => {
    const { data } = await supabase.from('team_photos').select('*');
    setPhotos(data || []);
  };

  const fetchUserVotes = async () => {
    if (!currentUser) return;
    const { data } = await supabase.from('votes').select('photo_id').eq('voter_email', currentUser.email);
    setUserVotes((data || []).map(v => v.photo_id));
  };

  const fetchWhitelist = async () => {
    const { data } = await supabase.from('users_whitelist').select('*').order('email');
    setWhitelist(data || []);
  };

  const fetchAllVotes = async () => {
    const { data } = await supabase.from('votes').select('*');
    setAllVotes(data || []);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    setLoading(true);

    const { data: userRecord, error } = await supabase
      .from('users_whitelist')
      .select('*')
      .eq('email', cleanEmail)
      .single();

    if (error || !userRecord) {
      alert('Email non presente tra le utenze autorizzate al contest.');
      setLoading(false);
      return;
    }

    localStorage.setItem('hqe_contest_user', JSON.stringify(userRecord));
    setCurrentUser(userRecord);
    setIsAdmin(userRecord.is_admin);
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('hqe_contest_user');
    setCurrentUser(null);
    setIsAdmin(false);
    setIsAdminUnlocked(false);
  };

  const handleAdminUnlock = (e) => {
    e.preventDefault();
    if (adminPasswordInput === ADMIN_PASSWORD) {
      setIsAdminUnlocked(true);
      setAdminPasswordInput('');
    } else {
      alert('Password Admin errata!');
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file || !teamName) return;

    if (new Date() > new Date(settings.upload_deadline)) {
      alert('Il termine per il caricamento delle foto è scaduto!');
      return;
    }

    setLoading(true);
    const fileExt = file.name.split('.').pop();
    const filePath = `${Date.now()}_${Math.random()}.${fileExt}`;

    const { error: uploadErr } = await supabase.storage.from('contest-photos').upload(filePath, file);
    if (uploadErr) {
      alert(uploadErr.message);
      setLoading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('contest-photos').getPublicUrl(filePath);

    await supabase.from('team_photos').insert([{
      team_name: teamName,
      photo_url: publicUrl,
      uploaded_by: currentUser.email
    }]);

    setTeamName('');
    setFile(null);
    setLoading(false);
    fetchPhotos();
    alert('Foto del Team caricata con successo!');
  };

  const handleVoteToggle = async (photoId) => {
    const now = new Date();
    if (now < new Date(settings.upload_deadline)) {
      alert('Le votazioni non sono ancora aperte.');
      return;
    }
    if (now > new Date(settings.vote_deadline)) {
      alert('Le votazioni sono chiuse.');
      return;
    }

    const hasVoted = userVotes.includes(photoId);

    if (hasVoted) {
      await supabase.from('votes').delete().match({ voter_email: currentUser.email, photo_id: photoId });
    } else {
      if (userVotes.length >= 4) {
        alert('Hai già raggiunto il limite massimo di 4 voti.');
        return;
      }
      await supabase.from('votes').insert([{ voter_email: currentUser.email, photo_id: photoId }]);
    }
    fetchUserVotes();
    if (isAdmin) fetchAllVotes();
  };

  const handleDeletePhoto = async (photoId, teamName) => {
    if (!window.confirm(`Sei sicuro di voler eliminare la foto del team "${teamName}"?`)) return;

    await supabase.from('votes').delete().eq('photo_id', photoId);
    const { error } = await supabase.from('team_photos').delete().eq('id', photoId);

    if (error) {
      alert('Errore eliminazione: ' + error.message);
    } else {
      alert(`Foto del team "${teamName}" eliminata.`);
      fetchPhotos();
      fetchUserVotes();
      if (isAdmin) fetchAllVotes();
    }
  };

  const handleAddWhitelist = async () => {
    if (!newEmail) return;
    await supabase.from('users_whitelist').insert([{ email: newEmail.trim().toLowerCase(), is_admin: false }]);
    setNewEmail('');
    fetchWhitelist();
  };

  const handleRemoveWhitelist = async (targetEmail) => {
    await supabase.from('users_whitelist').delete().eq('email', targetEmail);
    fetchWhitelist();
  };

  const handleSaveDeadlines = async () => {
    await supabase.from('contest_settings').update({
      upload_deadline: new Date(uploadDeadlineInput).toISOString(),
      vote_deadline: new Date(voteDeadlineInput).toISOString()
    }).eq('id', 1);
    fetchSettings();
    alert('Scadenze aggiornate correttamente.');
  };

  const isUploadPhase = settings && new Date() <= new Date(settings.upload_deadline);
  const isVotePhase = settings && new Date() > new Date(settings.upload_deadline) && new Date() <= new Date(settings.vote_deadline);

  const getPhotoVotesCount = (photoId) => {
    return allVotes.filter(v => v.photo_id === photoId).length;
  };

  const sortedPhotos = photos
    .map(p => ({ ...p, votesCount: getPhotoVotesCount(p.id) }))
    .sort((a, b) => b.votesCount - a.votesCount);

  const firstPlace = sortedPhotos[0];
  const secondPlace = sortedPhotos[1];
  const thirdPlace = sortedPhotos[2];

  return (
    <div style={{
      backgroundColor: '#0f172a',
      color: '#f8fafc',
      minHeight: '100vh',
      fontFamily: "'Segoe UI', Roboto, sans-serif",
      backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.12) 2px, transparent 0)',
      backgroundSize: '30px 30px'
    }}>
      <header style={{ borderBottom: '1px solid #334155', padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b' }}>
        <h1 style={{ margin: 0, color: '#38bdf8', fontSize: '24px', letterSpacing: '1px' }}>
          🎄 GRUPPO HQ | <span style={{ color: '#ef4444' }}>CONTEST NATALIZIO</span> ☃️
        </h1>
        {currentUser && (
          <button onClick={handleLogout} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            Esci ({currentUser.email})
          </button>
        )}
      </header>

      <div style={{ textAlign: 'center', fontSize: '26px', padding: '8px 0', background: 'rgba(30, 41, 59, 0.6)', letterSpacing: '8px' }}>
        ❄️ 🎄 ☃️ 🎁 🎅 🎄 ☃️ ❄️
      </div>

      <main style={{ maxWidth: '1050px', margin: '0 auto', padding: '20px' }}>
        {!currentUser ? (
          <div style={{ background: '#1e293b', padding: '40px', borderRadius: '12px', textAlign: 'center', maxWidth: '450px', margin: '40px auto', border: '1px solid #334155', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
            <h2 style={{ marginTop: 0, color: '#38bdf8' }}>GRUPPO HQ - CONTEST NATALIZIO</h2>
            <p style={{ color: '#94a3b8', fontSize: '14px' }}>Inserisci la tua email aziendale per accedere.</p>
            <form onSubmit={handleLogin} style={{ marginTop: '20px' }}>
              <input
                type="email"
                placeholder="nome.cognome@hqe.it"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                required
                style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff', marginBottom: '15px', boxSizing: 'border-box' }}
              />
              <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                Entra nel Contest
              </button>
            </form>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '25px', marginTop: '20px' }}>
            
            {/* MENU A SINISTRA */}
            <aside style={{ background: '#1e293b', padding: '20px', borderRadius: '10px', border: '1px solid #334155', height: 'fit-content' }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#f8fafc', fontSize: '18px' }}>
                📌 Menu Navigazione
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '15px' }}>Seleziona Sezione:</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: activeTab === 'upload' ? '#38bdf8' : '#f8fafc', fontWeight: activeTab === 'upload' ? 'bold' : 'normal' }}>
                  <input type="radio" name="navigation" checked={activeTab === 'upload'} onChange={() => setActiveTab('upload')} />
                  📸 Carica Foto Team
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: activeTab === 'vote' ? '#38bdf8' : '#f8fafc', fontWeight: activeTab === 'vote' ? 'bold' : 'normal' }}>
                  <input type="radio" name="navigation" checked={activeTab === 'vote'} onChange={() => setActiveTab('vote')} />
                  🗳️ Galleria & Votazione
                </label>

                {isAdmin && (
                  <>
                    <hr style={{ borderColor: '#334155', margin: '10px 0', width: '100%' }} />
                    <p style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 'bold', margin: '0' }}>AREA ADMIN</p>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: activeTab === 'admin_settings' ? '#f59e0b' : '#f8fafc', fontWeight: activeTab === 'admin_settings' ? 'bold' : 'normal' }}>
                      <input type="radio" name="navigation" checked={activeTab === 'admin_settings'} onChange={() => setActiveTab('admin_settings')} />
                      🛠️ Gestione Scadenze & Email
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: activeTab === 'admin_results' ? '#f59e0b' : '#f8fafc', fontWeight: activeTab === 'admin_results' ? 'bold' : 'normal' }}>
                      <input type="radio" name="navigation" checked={activeTab === 'admin_results'} onChange={() => setActiveTab('admin_results')} />
                      📊 Monitoraggio Voti & Podio
                    </label>
                  </>
                )}
              </div>
            </aside>

            {/* CONTENUTO PRINCIPALE */}
            <section style={{ background: '#1e293b', padding: '25px', borderRadius: '10px', border: '1px solid #334155' }}>
              
              <div style={{ background: '#0f172a', padding: '12px 18px', borderRadius: '8px', marginBottom: '20px', borderLeft: '4px solid #38bdf8' }}>
                <p style={{ margin: '2px 0', fontSize: '13px' }}>📸 <strong>Caricamento fino a:</strong> {settings ? new Date(settings.upload_deadline).toLocaleString() : '...'}</p>
                <p style={{ margin: '2px 0', fontSize: '13px' }}>🗳️ <strong>Votazioni fino a:</strong> {settings ? new Date(settings.vote_deadline).toLocaleString() : '...'}</p>
              </div>

              {/* UPLOAD FOTO */}
              {activeTab === 'upload' && (
                <div>
                  <h2 style={{ marginTop: 0, color: '#38bdf8' }}>📸 Carica la Foto del tuo Team</h2>
                  {isUploadPhase || isAdmin ? (
                    <form onSubmit={handleUpload} style={{ marginTop: '20px' }}>
                      <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px' }}>Nome del Team:</label>
                        <input
                          type="text"
                          value={teamName}
                          onChange={(e) => setTeamName(e.target.value)}
                          required
                          style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '5px' }}>Seleziona Immagine:</label>
                        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} required />
                      </div>
                      <button type="submit" disabled={loading} style={{ background: '#10b981', color: '#fff', padding: '12px 24px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                        Carica Foto Team
                      </button>
                    </form>
                  ) : (
                    <p style={{ color: '#ef4444' }}>La fase di caricamento delle foto si è conclusa.</p>
                  )}
                </div>
              )}

              {/* GALLERIA VOTI */}
              {activeTab === 'vote' && (
                <div>
                  <h2 style={{ marginTop: 0, color: '#38bdf8' }}>🗳️ Galleria Foto Team</h2>
                  <p style={{ color: '#94a3b8', fontSize: '14px' }}>
                    Hai espresso <strong>{userVotes.length}</strong> su 4 voti disponibili (minimo 3, massimo 4 preferenze).
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px', marginTop: '20px' }}>
                    {photos.map((photo) => {
                      const isVoted = userVotes.includes(photo.id);
                      return (
                        <div key={photo.id} style={{ background: '#0f172a', borderRadius: '8px', overflow: 'hidden', border: isVoted ? '2px solid #38bdf8' : '1px solid #334155' }}>
                          <img src={photo.photo_url} alt={photo.team_name} style={{ width: '100%', height: '160px', objectFit: 'cover' }} />
                          <div style={{ padding: '12px' }}>
                            <h4 style={{ margin: '0 0 10px 0', color: '#fff' }}>{photo.team_name}</h4>
                            <button
                              onClick={() => handleVoteToggle(photo.id)}
                              style={{
                                width: '100%',
                                padding: '8px',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                background: isVoted ? '#ef4444' : '#0284c7',
                                color: '#fff',
                                fontWeight: 'bold'
                              }}
                            >
                              {isVoted ? 'Rimuovi Voto ✕' : 'Vota Foto ★'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CONTROLLO PASSWORD ADMIN */}
              {(activeTab === 'admin_settings' || activeTab === 'admin_results') && isAdmin && !isAdminUnlocked && (
                <div style={{ background: '#0f172a', padding: '30px', borderRadius: '10px', textAlign: 'center', maxWidth: '400px', margin: '20px auto', border: '1px solid #334155' }}>
                  <h3 style={{ marginTop: 0, color: '#f59e0b' }}>🔒 Area Riservata Admin</h3>
                  <p style={{ color: '#94a3b8', fontSize: '13px' }}>Inserisci la password di amministrazione per sbloccare l'area.</p>
                  <form onSubmit={handleAdminUnlock} style={{ marginTop: '15px' }}>
                    <input
                      type="password"
                      placeholder="Password Admin"
                      value={adminPasswordInput}
                      onChange={(e) => setAdminPasswordInput(e.target.value)}
                      required
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569', background: '#1e293b', color: '#fff', marginBottom: '12px', boxSizing: 'border-box' }}
                    />
                    <button type="submit" style={{ width: '100%', padding: '10px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                      Sblocca Area Admin
                    </button>
                  </form>
                </div>
              )}

              {/* ADMIN SETTINGS */}
              {activeTab === 'admin_settings' && isAdmin && isAdminUnlocked && (
                <div>
                  <h2 style={{ marginTop: 0, color: '#f59e0b' }}>🛠️ Gestione Scadenze & Whitelist</h2>
                  
                  <div style={{ background: '#0f172a', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                    <h4 style={{ margin: '0 0 10px 0' }}>Imposta Scadenze</h4>
                    <div style={{ marginBottom: '10px' }}>
                      <label style={{ display: 'block', fontSize: '13px' }}>Fine Caricamento Foto:</label>
                      <input type="datetime-local" value={uploadDeadlineInput} onChange={(e) => setUploadDeadlineInput(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #475569', background: '#1e293b', color: '#fff' }} />
                    </div>
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', fontSize: '13px' }}>Fine Votazione:</label>
                      <input type="datetime-local" value={voteDeadlineInput} onChange={(e) => setVoteDeadlineInput(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #475569', background: '#1e293b', color: '#fff' }} />
                    </div>
                    <button onClick={handleSaveDeadlines} style={{ background: '#f59e0b', color: '#fff', padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Salva Scadenze</button>
                  </div>

                  <div style={{ background: '#0f172a', padding: '15px', borderRadius: '8px' }}>
                    <h4 style={{ margin: '0 0 10px 0' }}>Gestione Email Abilitate ({whitelist.length})</h4>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                      <input type="email" placeholder="nuova.email@hqe.it" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} style={{ padding: '6px', borderRadius: '4px', flex: 1, border: '1px solid #475569', background: '#1e293b', color: '#fff' }} />
                      <button onClick={handleAddWhitelist} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', fontWeight: 'bold' }}>Aggiungi</button>
                    </div>
                    <ul style={{ maxHeight: '180px', overflowY: 'auto', background: '#1e293b', padding: '10px', borderRadius: '4px', listStyle: 'none', margin: 0 }}>
                      {whitelist.map(u => (
                        <li key={u.email} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #334155', fontSize: '13px' }}>
                          <span>{u.email} {u.is_admin ? '👑 (Admin)' : ''}</span>
                          {!u.is_admin && <button onClick={() => handleRemoveWhitelist(u.email)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer' }}>X</button>}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* ADMIN RESULTS & PODIO */}
              {activeTab === 'admin_results' && isAdmin && isAdminUnlocked && (
                <div>
                  <h2 style={{ marginTop: 0, color: '#f59e0b' }}>📊 Monitoraggio Risultati & Podio</h2>
                  <p style={{ color: '#94a3b8', fontSize: '13px' }}>Classifica in tempo reale visibile soltanto alle 4 utenze Admin.</p>

                  {/* PODIO NATALIZIO */}
                  {sortedPhotos.length > 0 && (
                    <div style={{ background: '#0f172a', padding: '25px 15px', borderRadius: '12px', margin: '20px 0', border: '1px solid #334155' }}>
                      <h3 style={{ textAlign: 'center', margin: '0 0 20px 0', color: '#38bdf8' }}>🏆 PODIO CONTEST NATALIZIO 🏆</h3>
                      
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: '15px' }}>
                        
                        {/* 2° POSTO (ARGENTO) */}
                        {secondPlace && (
                          <div style={{ textAlign: 'center', width: '140px', background: '#1e293b', borderRadius: '8px 8px 0 0', border: '2px solid #cbd5e1', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '24px' }}>🥈</span>
                            <img src={secondPlace.photo_url} alt={secondPlace.team_name} style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '4px', margin: '5px 0' }} />
                            <strong style={{ fontSize: '13px', color: '#cbd5e1', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '120px' }}>{secondPlace.team_name}</strong>
                            <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 'bold' }}>{secondPlace.votesCount} voti</span>
                            <div style={{ width: '100%', height: '50px', background: '#475569', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#fff' }}>2°</div>
                          </div>
                        )}

                        {/* 1° POSTO (ORO) */}
                        {firstPlace && (
                          <div style={{ textAlign: 'center', width: '160px', background: '#1e293b', borderRadius: '8px 8px 0 0', border: '2px solid #f59e0b', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '32px' }}>🥇</span>
                            <img src={firstPlace.photo_url} alt={firstPlace.team_name} style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px', margin: '5px 0' }} />
                            <strong style={{ fontSize: '14px', color: '#f59e0b', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '140px' }}>{firstPlace.team_name}</strong>
                            <span style={{ fontSize: '13px', color: '#38bdf8', fontWeight: 'bold' }}>{firstPlace.votesCount} voti</span>
                            <div style={{ width: '100%', height: '80px', background: '#b45309', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>1°</div>
                          </div>
                        )}

                        {/* 3° POSTO (BRONZO) */}
                        {thirdPlace && (
                          <div style={{ textAlign: 'center', width: '140px', background: '#1e293b', borderRadius: '8px 8px 0 0', border: '2px solid #b45309', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '24px' }}>🥉</span>
                            <img src={thirdPlace.photo_url} alt={thirdPlace.team_name} style={{ width: '100%', height: '70px', objectFit: 'cover', borderRadius: '4px', margin: '5px 0' }} />
                            <strong style={{ fontSize: '13px', color: '#d97706', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '120px' }}>{thirdPlace.team_name}</strong>
                            <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 'bold' }}>{thirdPlace.votesCount} voti</span>
                            <div style={{ width: '100%', height: '35px', background: '#78350f', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#fff' }}>3°</div>
                          </div>
                        )}

                      </div>
                    </div>
                  )}

                  {/* TABELLA DETTAGLIATA */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
                    <thead>
                      <tr style={{ background: '#0f172a', textAlign: 'left', borderBottom: '2px solid #334155' }}>
                        <th style={{ padding: '10px' }}>Pos.</th>
                        <th style={{ padding: '10px' }}>Team</th>
                        <th style={{ padding: '10px' }}>Caricata da</th>
                        <th style={{ padding: '10px' }}>Totale Voti</th>
                        <th style={{ padding: '10px', textAlign: 'center' }}>Azione Admin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPhotos.map((photo, idx) => (
                        <tr key={photo.id} style={{ borderBottom: '1px solid #334155' }}>
                          <td style={{ padding: '10px', fontWeight: 'bold', color: idx === 0 ? '#f59e0b' : idx === 1 ? '#cbd5e1' : idx === 2 ? '#d97706' : '#fff' }}>
                            #{idx + 1}
                          </td>
                          <td style={{ padding: '10px', fontWeight: 'bold' }}>{photo.team_name}</td>
                          <td style={{ padding: '10px', color: '#94a3b8', fontSize: '13px' }}>{photo.uploaded_by}</td>
                          <td style={{ padding: '10px', color: '#38bdf8', fontWeight: 'bold', fontSize: '16px' }}>{photo.votesCount}</td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <button
                              onClick={() => handleDeletePhoto(photo.id, photo.team_name)}
                              style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                            >
                              Elimina 🗑️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

            </section>
          </div>
        )}
      </main>
    </div>
  );
}
