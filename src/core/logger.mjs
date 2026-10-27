const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

function formatTime() {
  const d = new Date();
  return d.toTimeString().split(' ')[0];
}

export const logger = {
  info(msg, ...args) {
    console.log(`${COLORS.gray}[${formatTime()}]${COLORS.reset} ${COLORS.cyan}[OmniClip]${COLORS.reset} ${msg}`, ...args);
  },
  success(msg, ...args) {
    console.log(`${COLORS.gray}[${formatTime()}]${COLORS.reset} ${COLORS.green}✔ [OmniClip]${COLORS.reset} ${COLORS.green}${msg}${COLORS.reset}`, ...args);
  },
  warn(msg, ...args) {
    console.warn(`${COLORS.gray}[${formatTime()}]${COLORS.reset} ${COLORS.yellow}⚠ [OmniClip]${COLORS.reset} ${COLORS.yellow}${msg}${COLORS.reset}`, ...args);
  },
  error(msg, ...args) {
    console.error(`${COLORS.gray}[${formatTime()}]${COLORS.reset} ${COLORS.red}✖ [OmniClip]${COLORS.reset} ${COLORS.red}${msg}${COLORS.reset}`, ...args);
  },
  platform(platform, msg, ...args) {
    const pColor = {
      youtube: COLORS.red,
      tiktok: COLORS.magenta,
      facebook: COLORS.blue,
      instagram: COLORS.yellow
    }[platform.toLowerCase()] || COLORS.cyan;

    console.log(`${COLORS.gray}[${formatTime()}]${COLORS.reset} ${pColor}[${platform.toUpperCase()}]${COLORS.reset} ${msg}`, ...args);
  }
};
