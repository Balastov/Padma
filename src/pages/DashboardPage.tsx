import { useState } from 'react'
import Header from '../components/Header'
import NextLesson from '../components/NextLesson'
import Schedule from '../components/Schedule'
import Homework from '../components/Homework'
import Chat from '../components/Chat'
import bgDash from '../assets/bg-dashboard.jpg'
import './DashboardPage.css'

export default function DashboardPage() {
  const [chatOpen, setChatOpen] = useState(false)

  return (
    <div className="dash">
      <div
        className="dash__bg"
        style={{ backgroundImage: `url(${bgDash})` }}
        aria-hidden
      />
      <div className="dash__veil" aria-hidden />

      <div className="dash__frame">
        <Header />

        <main className="dash__grid">
          <NextLesson />
          <Schedule />
          <Homework />
          <Chat open={chatOpen} onToggle={() => setChatOpen((v) => !v)} />
        </main>
      </div>
    </div>
  )
}
