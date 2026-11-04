import { HashRouter, NavLink, Route, Routes } from 'react-router'
import Home from './pages/Home'
import ManagerDetail from './pages/ManagerDetail'
import Managers from './pages/Managers'
import TradeDetail from './pages/TradeDetail'
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
            <NavLink to="/managers">Managers</NavLink>
          </nav>
        </div>
      </header>
      <main className="wrap">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/trades" element={<Trades />} />
          <Route path="/trades/:id" element={<TradeDetail />} />
          <Route path="/managers" element={<Managers />} />
          <Route path="/managers/:id" element={<ManagerDetail />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </HashRouter>
  )
}
