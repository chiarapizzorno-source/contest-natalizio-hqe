import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [settings, setSettings] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [userVotes, setUserVotes] = useState([]);
  const [whitelist, setWhitelist] = useState([]);
  
  const [teamName, setTeamName] = useState('');
  const [file, setFile] = useState(null);
  
  const [newEmail, setNewEmail] = useState('');
  const [uploadDeadlineInput, setUploadDeadlineInput] = useState('');
  const [voteDeadlineInput, setVoteDeadlineInput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkUserRole(session.user.email);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) checkUserRole(session.user.email);
    });

    fetchSettings();
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      fetchPhotos();
      fetchUserVotes();
      if (isAdmin) fetchWhitelist();
    }
  }, [session, isAdmin]);

  const checkUserRole = async (userEmail) => {
    const { data } = await supabase
      .from('users_whitelist')
      .select('is_admin')
      .eq('email', userEmail.toLowerCase())
      .single();
    if (data) setIsAdmin(data.is_admin);
  };

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
    const { data } = await supabase.from('votes').select('photo_id').eq('voter_email', session.user.email);
    setUserVotes((data || []).map(v => v.photo_id));
  };

  const fetchWhitelist = async () => {
    const { data } = await supabase.from('users_whitelist').select('*').order('email');
    setWhitelist(data || []);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    const { data: allowed } = await supabase
      .from('users_whitelist')
      .select('email')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (!allowed) {
      alert('Email non presente tra le utenze autorizzate.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase() });
    if (error) alert(error.message);
    else alert('Magic Link inviato! Controlla la tua casella di posta aziendale.');
    setLoading(false);
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
      uploaded_by: session.user.email
    }]);

    setTeamName('');
    setFile(null);
    setLoading(false);
    fetchPhotos();
    alert('Foto caricata con successo!');
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
      await supabase.from('votes').delete().match({ voter_email: session.user.email, photo_id: photoId });
    } else {
      if (userVotes.length >= 4) {
        alert('Puoi esprimere un massimo di 4 voti.');
        return;
      }
      await supabase.from('votes').insert([{ voter_email: session.user.email, photo_id: photoId }]);
    }
    fetchUserVotes();
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

  return (
    <div style={{ backgroundColor: '#0f172a', color: '#f8fafc', minHeight: '100vh', fontFamily: 'Segoe UI, sans-serif' }}>
      <header style={{ borderBottom: '1px solid #334155', padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b' }}>
        <h1 style={{ margin: 0, color: '#38bdf8', fontSize: '24px', letterSpacing: '1px' }}>
          HQE | <span style={{ color: '#ef4444' }}>CONTEST NATALIZIO</span>
        </h1>
        {session && (
          <button onClick={() => supabase.auth.signOut()} style={{ background: '#475569', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>
            Esci ({session.user.email})
          </button>
        )}
      </header>

      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '30px 20px' }}>
        {!session ? (
          <div style={{ background: '#1e293b', padding: '40px', borderRadius: '12px', textAlign: 'center', maxWidth: '450px', margin: '50px auto', border: '1px solid #334155' }}>
            <h2 style={{ marginTop: 0, color: '#38bdf8' }}>CONTEST NATALIZIO HQE</h2>
            <p style={{ color: '#94a3b8', fontSize: '14px' }}>Inserisci la tua email aziendale per accedere all'app.</p>
            <form onSubmit={handleLogin} style={{ marginTop: '20px' }}>
              <input
                type="email"
                placeholder="nome.cognome@hqe.it"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: '#fff', marginBottom: '15px', boxSizing: 'border-box' }}
              />
              <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                Invia Magic Link di Accesso
              </button>
            </form>
          </div>
        ) : (
          <>
            <div style={{ background: '#1e293b', borderLeft: '4px solid #0284c7', padding: '15px 20px', borderRadius: '6px', marginBottom: '30px' }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#38bdf8' }}>Stato delle Fasi</h3>
              <p style={{ margin: '4px 0' }}>📸 <strong>Fine Caricamento Foto:</strong> {settings ? new Date(settings.upload_deadline).toLocaleString() : '...'}</p>
              <p style={{ margin: '4px 0' }}>🗳️ <strong>Fine Votazione:</strong> {settings ? new Date(settings.vote_deadline).toLocaleString() : '...'}</p>
              <p style={{ marginTop: '10px', fontWeight: 'bold', color: isUploadPhase ? '#34d399' : isVotePhase ? '#f59e0b' : '#ef4444' }}>
                Fase Attuale: {isUploadPhase ? 'Caricamento Foto in corso' : isVotePhase ? 'Votazione Aperta' : 'Contest Concluso'}
              </p>
            </div>

            {(isUploadPhase || isAdmin) && (
              <section style={{ background: '#1e293b', padding: '25px', borderRadius: '10px', marginBottom: '30px', border: '1px solid #334155' }}>
                <h3 style={{ marginTop: 0, color: '#38bdf8' }}>Carica la foto del tuo TEAM</h3>
                <form onSubmit={handleUpload}>
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
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Seleziona Immagine:</label>
                    <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} required />
                  </div>
                  <button type="submit" disabled={loading} style={{ background: '#10b981', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                    Carica Foto
                  </button>
                </form>
              </section>
            )}

            <section>
              <h3>Galleria Foto Team</h3>
              {isVotePhase && (
                <p style={{ color: '#94a3b8' }}>
                  Hai espresso <strong>{userVotes.length}</strong> voti (minimo 3, massimo 4 preferenze).
                </p>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px', marginTop: '20px' }}>
                {photos.map((photo) => {
                  const isVoted = userVotes.includes(photo.id);
                  return (
                    <div key={photo.id} style={{ background: '#1e293b', borderRadius: '8px', overflow: 'hidden', border: isVoted ? '2px solid #38bdf8' : '1px solid #334155' }}>
                      <img src={photo.photo_url} alt={photo.team_name} style={{ width: '100%', height: '200px', objectFit: 'cover' }} />
                      <div style={{ padding: '15px' }}>
                        <h4 style={{ margin: '0 0 10px 0' }}>{photo.team_name}</h4>
                        {isVotePhase && (
                          <button
                            onClick={() => handleVoteToggle(photo.id)}
                            style={{
                              width: '100%',
                              padding: '10px',
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
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {isAdmin && (
              <section style={{ marginTop: '50px', borderTop: '2px solid #334155', paddingTop: '30px' }}>
                <h2 style={{ color: '#f59e0b' }}>🛠️ Pannello Amministrazione</h2>

                <div style={{ background: '#1e293b', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #334155' }}>
                  <h3>Imposta Scadenze Fasi</h3>
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', marginBottom: '4px' }}>Fine Caricamento Foto:</label>
                    <input type="datetime-local" value={uploadDeadlineInput} onChange={(e) => setUploadDeadlineInput(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #475569', background: '#0f172a', color: '#fff' }} />
                  </div>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '4px' }}>Fine Votazione:</label>
                    <input type="datetime-local" value={voteDeadlineInput} onChange={(e) => setVoteDeadlineInput(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #475569', background: '#0f172a', color: '#fff' }} />
                  </div>
                  <button onClick={handleSaveDeadlines} style={{ background: '#f59e0b', color: '#fff', padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Salva Scadenze</button>
                </div>

                <div style={{ background: '#1e293b', padding: '20px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <h3>Gestione Whitelist Email Aziendali</h3>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                    <input
                      type="email"
                      placeholder="nuova.email@hqe.it"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      style={{ padding: '8px', borderRadius: '4px', flex: 1, border: '1px solid #475569', background: '#0f172a', color: '#fff' }}
                    />
                    <button onClick={handleAddWhitelist} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Aggiungi Email</button>
                  </div>
                  <ul style={{ maxHeight: '200px', overflowY: 'auto', background: '#0f172a', padding: '10px 15px', borderRadius: '4px', listStyle: 'none' }}>
                    {whitelist.map(u => (
                      <li key={u.email} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1e293b' }}>
                        <span>{u.email} {u.is_admin ? '👑 (Admin)' : ''}</span>
                        {!u.is_admin && (
                          <button onClick={() => handleRemoveWhitelist(u.email)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '2px 8px', borderRadius: '3px', cursor: 'pointer' }}>Rimuovi</button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
