import { HashRouter, NavLink, Route, Routes } from 'react-router'
import Home from './pages/Home'
import Trades from './pages/Trades'

export default function App() {
  return (
    <HashRouter>
      <header className="site-header">
        <div className="wrap">
          <NavLink to="/" className="brand">
            Dookie Dynasty
          </NavLink>
          <nav>
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/trades">Trades</NavLink>
          </nav>
        </div>
      </header>
      <main className="wrap">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/trades" element={<Trades />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </HashRouter>
  )
}
