import { useRef, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import Webcam from 'react-webcam';
import axios from 'axios';
import { estimateAgeLocally } from './ageEstimation.js';
import logo from './assets/logo.png';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
});

function dataUrlFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [user, setUser] = useState(null);
  const [image, setImage] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const webcamRef = useRef(null);
  const fileRef = useRef(null);

  async function onLogin({ credential }) {
    try {
      if (!credential) throw new Error('O Google não retornou uma credencial.');
      const decoded = jwtDecode(credential);
      const response = await api.post('/api/auth/google', {
        googleId: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
      });
      setUser(response.data.user);
      loadHistory(response.data.user.id);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Não foi possível entrar com o Google.');
    }
  }

  async function loadHistory(userId) {
    try {
      const response = await api.get('/api/scans', { params: { userId } });
      setHistory(response.data.scans);
    } catch {
      setError('Não foi possível carregar suas imagens.');
    }
  }

  function logout() {
    setUser(null);
    setImage(null);
    setResult(null);
    setHistory([]);
    setError('');
  }

  function capture() {
    const captured = webcamRef.current?.getScreenshot();
    if (captured) {
      setImage(captured);
      setResult(null);
      setError('');
    }
  }

  async function selectFile(event) {
    const [file] = event.target.files;
    if (!file) return;
    try {
      setImage(await dataUrlFromFile(file));
      setResult(null);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function analyze() {
    if (!image || !user) return;
    setLoading(true);
    setError('');
    try {
      const age = await estimateAgeLocally(image);
      const response = await api.post('/api/analyze', {
        userId: user.id,
        imageBase64: image,
        age,
      });
      setResult(response.data);
      await loadHistory(user.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível analisar a imagem.');
    } finally {
      setLoading(false);
    }
  }

  async function deleteScan(scanId) {
    if (!confirm('Deseja realmente excluir este meme?')) return;
    try {
      await api.delete(`/api/scans/${scanId}`, { params: { userId: user.id } });
      setHistory((prev) => prev.filter((scan) => scan.id !== scanId));
      if (result && result.id === scanId) {
        setResult(null);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível excluir o meme.');
    }
  }

  async function clearHistory() {
    if (history.length === 0) return;
    if (!confirm('Deseja apagar todos os memes do histórico?')) return;
    try {
      await api.delete('/api/scans', { params: { userId: user.id } });
      setHistory([]);
      setResult(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível limpar o histórico.');
    }
  }

  if (!user) {
    return (
      <main className="login-page">
        <section className="login-card">
          <img className="project-logo" src={logo} alt="Logo do projeto" />
          <span className="eyebrow">MEME AGE LAB</span>
          <div className="warning-sign">
            <div className="warning-header">
              <span className="warning-icon">⚠️</span>
              <h2>ATENÇÃO</h2>
              <span className="warning-icon">⚠️</span>
            </div>
            <p className="warning-text">
              Se você não está preparado para sofrer bullying, <strong>não entre!</strong>
            </p>
          </div>
          <GoogleLogin onSuccess={onLogin} onError={() => setError('Login cancelado.')} />
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell" style={{ backgroundColor: '#eeeeea' }}>
      <header className="topbar">
        <div><span className="eyebrow" style={{ color: 'black' }}>MEME LAB</span><h1 style={{ color: '#42ac2a', borderBlockColor: 'black' }}>Seu rosto, Que Nojo!</h1></div>
        <div className="profile">
          {user.picture && <img src={user.picture} alt="" />}
          <span>{user.name}</span>
          <button className="logout" onClick={logout}>Sair</button>
        </div>
      </header>
      <section className="workspace">
        <div className="camera-card">
          <div className="camera-frame">
            {image ? <img src={image} alt="Imagem selecionada" /> : <Webcam ref={webcamRef} screenshotFormat="image/jpeg" mirrored />}
          </div>
          <div className="actions">
            <button className="secondary" onClick={capture}>Tirar foto</button>
            <button className="secondary" onClick={() => fileRef.current?.click()}>Escolher imagem</button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile} hidden />
          </div>
          <button className="primary" onClick={analyze} disabled={!image || loading}>
            {loading ? 'Analisando...' : 'Você deveria ser assim?'}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
        <aside className="result-card">
          <span className="eyebrow">RESULTADO</span>
          {result ? (
            <>
              <strong className="age">{result.age}<small> anos</small></strong>
              <p>Essa é a estimativa da idade desta foto.</p>
              {result.memeAvailable ? (
                <a className="download" href={`${api.defaults.baseURL}/api/scans/${result.id}/meme`} download={`meme-${result.id}.jpg`}>Baixar meme</a>
              ) : (
                <p className="error">A idade foi calculada, mas nÃ£o foi possÃ­vel gerar o meme agora.</p>
              )}
              <a className="text-link" href={`${api.defaults.baseURL}/api/scans/${result.id}/image`} download={`foto-${result.id}`}>Baixar foto original</a>
              <button className="text-link delete-current" onClick={() => deleteScan(result.id)}>Excluir este resultado</button>
            </>
          ) : <p className="placeholder">Capture ou escolha uma imagem para começar.</p>}
        </aside>
      </section>
      <section className="history">
        <div className="section-heading">
          <div>
            <span className="eyebrow" style={{ color: 'black' }}>SEUS MEMES</span>
            <span style={{ color: '#666', marginLeft: '10px' }}>Disponíveis por 30 dias</span>
          </div>
          {history.length > 0 && (
            <button className="clear-history" onClick={clearHistory}>
              Limpar tudo
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="placeholder">Nenhum meme salvo no histórico.</p>
        ) : (
          <div className="history-grid">
            {history.map((scan) => (
              <article className="history-item" key={scan.id}>
                {scan.memeMimeType ? (
                  <img src={`${api.defaults.baseURL}/api/scans/${scan.id}/meme`} alt={`Meme com estimativa de ${scan.age} anos`} />
                ) : (
                  <p className="placeholder">Meme nÃ£o gerado</p>
                )}
                <div className="history-footer">
                  <strong>{scan.age} anos</strong>
                  <div className="history-actions">
                    {scan.memeMimeType && (
                      <a className="history-link" href={`${api.defaults.baseURL}/api/scans/${scan.id}/meme`} download={`meme-${scan.id}.jpg`} title="Baixar meme">
                        Baixar
                      </a>
                    )}
                    <button className="delete-btn" onClick={() => deleteScan(scan.id)} title="Excluir meme">
                      Excluir
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
