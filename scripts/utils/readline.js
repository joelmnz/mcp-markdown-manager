/**
 * Simple readline utility for CLI prompts
 * Using JavaScript for better Bun compatibility
 */

import { createInterface } from 'readline';

/**
 * Create a readline interface for user input
 */
function createReadlineInterface() {
  return createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Ask a yes/no question and return boolean
 */
export async function askYesNo(question, defaultValue = false) {
  const rl = createReadlineInterface();
  const defaultText = defaultValue ? '[Y/n]' : '[y/N]';
  
  return new Promise((resolve) => {
    rl.question(`${question} ${defaultText}: `, (answer) => {
      rl.close();
      
      const normalized = answer.toLowerCase().trim();
      if (normalized === '') {
        resolve(defaultValue);
      } else if (normalized === 'y' || normalized === 'yes') {
        resolve(true);
      } else if (normalized === 'n' || normalized === 'no') {
        resolve(false);
      } else {
        // Invalid input, use default
        resolve(defaultValue);
      }
    });
  });
}

/**
 * Ask a multiple choice question
 */
export async function askChoice(question, choices, defaultChoice = 0) {
  const rl = createReadlineInterface();
  
  console.log(question);
  choices.forEach((choice, index) => {
    const marker = index === defaultChoice ? '*' : ' ';
    console.log(`${marker} ${index + 1}. ${choice}`);
  });
  
  return new Promise((resolve) => {
    rl.question(`Enter choice (1-${choices.length}) [${defaultChoice + 1}]: `, (answer) => {
      rl.close();
      
      const choice = parseInt(answer.trim(), 10);
      if (isNaN(choice) || choice < 1 || choice > choices.length) {
        resolve(defaultChoice);
      } else {
        resolve(choice - 1);
      }
    });
  });
}

/**
 * Ask for text input with optional default
 */
export async function askText(question, defaultValue = '') {
  const rl = createReadlineInterface();
  const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
  
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

/**
 * Show a confirmation prompt with details
 */
export async function confirmAction(action, details = [], warning = null) {
  console.log(`\nAbout to ${action}:`);
  
  if (details.length > 0) {
    details.forEach(detail => console.log(`  - ${detail}`));
  }
  
  if (warning) {
    console.log(`\n⚠️  WARNING: ${warning}`);
  }
  
  return await askYesNo('\nDo you want to continue?', false);
}

export const readlineSync = {
  askYesNo,
  askChoice,
  askText,
  confirmAction
};