import React from 'react';
import { Coffee, RotateCw } from 'lucide-react';

// Top-level React error boundary. Without it, a render error in any view blanks
// the entire screen (white page) with no way back — a dead tablet mid-service on
// a POS. This catches the error, logs it for debugging, and gives staff a
// one-tap reload instead. Error boundaries must be class components.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Surface to the browser console (and any remote logger layered on later).
    // Kept deliberately minimal so the boundary itself can never throw.
    console.error('UI crash caught by ErrorBoundary:', error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-bean">
        <div className="bg-white p-10 rounded-[3rem] shadow-2xl max-w-sm w-full border-t-[12px] border-chiya text-center">
          <div className="bg-cream p-5 rounded-3xl shadow-sm inline-flex mb-6">
            <Coffee size={40} className="text-espresso" />
          </div>
          <h1 className="text-2xl font-bold text-bean handwritten">Something spilled…</h1>
          <p className="text-gray-500 font-medium mt-3 mb-8 text-sm">
            The screen hit an unexpected error. Your data is safe — reloading usually
            fixes it.
          </p>
          <button
            onClick={this.handleReload}
            className="w-full bg-espresso text-white py-4 rounded-[1.5rem] font-black text-lg hover:bg-bean transition-colors shadow-xl inline-flex items-center justify-center gap-2"
          >
            <RotateCw size={20} /> Reload
          </button>
        </div>
      </div>
    );
  }
}
