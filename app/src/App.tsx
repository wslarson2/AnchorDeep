import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Header from './components/layout/Header.tsx'
import SearchPage from './pages/SearchPage.tsx'
import ListingDetailPage from './pages/ListingDetailPage.tsx'
import SavedListingsPage from './pages/SavedListingsPage.tsx'
import AlertsPage from './pages/AlertsPage.tsx'
import NotFoundPage from './pages/NotFoundPage.tsx'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<SearchPage />} />
            <Route path="/listings/:id" element={<ListingDetailPage />} />
            <Route path="/saved" element={<SavedListingsPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
