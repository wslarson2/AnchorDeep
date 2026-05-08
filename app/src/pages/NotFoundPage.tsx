import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-24 text-center">
      <p className="text-6xl mb-4">⚓</p>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Lost at sea</h1>
      <p className="text-gray-500 mb-6">This page doesn't exist.</p>
      <Link to="/" className="text-ocean-600 hover:underline">Back to search</Link>
    </div>
  )
}
