/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#07070B',
          surface: '#12131A',
          card: '#1A1B24',
        },
        brand: {
          red: '#FF3B30',
          'red-dark': '#C02020',
          'red-deeper': '#8B1414',
          gold: '#F6C34A',
          'gold-dark': '#D4A520',
        },
        rb: {
          muted: '#9AA0B2',
          border: '#2A2C3A',
        },
        tier: {
          bronze: '#CD7F32',
          silver: '#D4D4D8',
          gold: '#FFD700',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Oswald', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        label: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'float': 'float 4s ease-in-out infinite',
        'shimmer': 'shimmer 2s infinite',
        'particle-rise': 'particleRise 6s linear infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'fade-up': 'fadeUp 0.8s ease-out forwards',
        'shake': 'shake 0.8s cubic-bezier(0.36, 0.07, 0.19, 0.97) both',
        'box-flash': 'boxFlash 0.5s ease-out forwards',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%) skewX(-12deg)' },
          '100%': { transform: 'translateX(200%) skewX(-12deg)' },
        },
        particleRise: {
          '0%': { transform: 'translateY(100vh) scale(0)', opacity: '0' },
          '10%': { opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { transform: 'translateY(-20vh) scale(1)', opacity: '0' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0) rotate(0deg)' },
          '10%': { transform: 'translateX(-6px) rotate(-3deg)' },
          '20%': { transform: 'translateX(6px) rotate(3deg)' },
          '30%': { transform: 'translateX(-6px) rotate(-2deg)' },
          '40%': { transform: 'translateX(6px) rotate(2deg)' },
          '50%': { transform: 'translateX(-4px) rotate(-1deg)' },
          '60%': { transform: 'translateX(4px) rotate(1deg)' },
          '70%': { transform: 'translateX(-2px) rotate(0deg)' },
          '80%': { transform: 'translateX(2px) rotate(0deg)' },
          '90%': { transform: 'translateX(-1px) rotate(0deg)' },
        },
        boxFlash: {
          '0%': { opacity: '0' },
          '30%': { opacity: '0.8' },
          '100%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
