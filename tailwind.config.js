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
          DEFAULT: '#050508',
          surface: '#0A0B0F',
          card: '#12131A',
        },
        brand: {
          red: '#BF1220',
          'red-dark': '#8B0000',
          'red-deeper': '#4D0000',
          gold: '#C9A84C',
          'gold-dark': '#A08030',
        },
        rb: {
          muted: '#808A99',
          border: '#333840',
        },
        tier: {
          bronze: '#996633',
          silver: '#A0A8B8',
          gold: '#C9A84C',
        }
      },
      fontFamily: {
        sans: ['Space Mono', 'monospace'],
        display: ['Bebas Neue', 'sans-serif'],
        headline: ['Bebas Neue', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
        label: ['Space Mono', 'monospace'],
      },
      animation: {
        'float': 'float 4s ease-in-out infinite',
        'shimmer': 'shimmer 2s infinite',
        'particle-rise': 'particleRise 6s linear infinite',
        'pulse-glow': 'pulseGlow 7s ease-in-out infinite',
        'fade-up': 'fadeUp 0.8s ease-out forwards',
        'shake': 'shake 0.8s cubic-bezier(0.36, 0.07, 0.19, 0.97) both',
        'box-flash': 'boxFlash 0.5s ease-out forwards',
        'grain': 'grain 8s steps(10) infinite',
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
          '0%, 100%': { boxShadow: '0 4px 25px hsla(355, 83%, 41%, 0.4)' },
          '50%': { boxShadow: '0 4px 40px hsla(355, 83%, 41%, 0.5)' },
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
        grain: {
          '0%, 100%': { transform: 'translate(0,0)' },
          '10%': { transform: 'translate(-5%,-10%)' },
          '20%': { transform: 'translate(-15%,5%)' },
          '30%': { transform: 'translate(7%,-25%)' },
          '40%': { transform: 'translate(-5%,25%)' },
          '50%': { transform: 'translate(-15%,10%)' },
          '60%': { transform: 'translate(15%,0%)' },
          '70%': { transform: 'translate(0%,15%)' },
          '80%': { transform: 'translate(3%,35%)' },
          '90%': { transform: 'translate(-10%,10%)' },
        },
      },
    },
  },
  plugins: [],
}
