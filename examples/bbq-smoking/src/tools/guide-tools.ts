import type { ScaffoldTool, ToolContext, ToolResult } from '@voygent/scaffold-core';
import { loadKnowledge } from '@voygent/scaffold-core';

interface SmokingGuide {
  meat: string;
  smokerTempF: string;
  targetInternalF: string;
  timePerLb: string;
  bestWood: string[];
  wrapTemp?: string;
  wrapMaterial?: string;
  keyTips: string[];
}

const GUIDES: SmokingGuide[] = [
  {
    meat: 'brisket',
    smokerTempF: '225-275°F (250°F is the sweet spot)',
    targetInternalF: '195-205°F (203°F is ideal, but probe-tender is the real test)',
    timePerLb: '60-90 min/lb',
    bestWood: ['post oak', 'hickory', 'mesquite (sparingly)'],
    wrapTemp: '160-170°F (when the stall hits)',
    wrapMaterial: 'Butcher paper (breathes, preserves bark) or foil (faster, softer bark)',
    keyTips: [
      'The stall at 150-170°F is caused by evaporative cooling — it\'s normal, don\'t crank the heat',
      'Fat cap orientation is debated: up retains moisture, down protects from direct heat',
      'Rest for minimum 1 hour, ideally 2-4 hours in a cooler wrapped in towels',
      'Slice against the grain — the flat and point have different grain directions',
      'The flat and point can be separated and sliced differently',
      'Spritz with apple cider vinegar or beef broth every 45 min after bark sets',
    ],
  },
  {
    meat: 'pork butt',
    smokerTempF: '225-250°F',
    targetInternalF: '195-205°F (must be probe-tender for pulling)',
    timePerLb: '75-90 min/lb',
    bestWood: ['hickory', 'cherry', 'apple', 'pecan'],
    wrapTemp: '160-170°F',
    wrapMaterial: 'Foil or butcher paper',
    keyTips: [
      'Very forgiving cut — hard to overcook due to high fat and collagen content',
      'The bone should slide out clean when done',
      'Let rest 30-60 min before pulling',
      'Apply mustard as a binder before rub — it cooks off but helps bark form',
      'Save the drippings to mix back into pulled pork',
    ],
  },
  {
    meat: 'ribs',
    smokerTempF: '250-275°F',
    targetInternalF: '190-205°F (or use the bend test)',
    timePerLb: '5-6 hours total for a full rack (3-2-1 method for spare ribs, 2-2-1 for baby backs)',
    bestWood: ['cherry', 'apple', 'hickory', 'pecan'],
    wrapTemp: 'After 2-3 hours when bark sets',
    wrapMaterial: 'Foil with liquid (apple juice, butter, brown sugar)',
    keyTips: [
      '3-2-1 method: 3 hrs smoke, 2 hrs wrapped, 1 hr unwrapped with sauce',
      'Remove membrane from bone side before seasoning',
      'The bend test: pick up the rack from one end — it should bend and crack but not break apart',
      'Baby backs cook faster than spare ribs — adjust time accordingly',
      'Meat pulling back from bones 1/4 to 1/2 inch is a good visual cue',
    ],
  },
  {
    meat: 'chicken',
    smokerTempF: '300-350°F (higher than other meats to get crispy skin)',
    targetInternalF: '165°F in the thickest part of the thigh',
    timePerLb: '30-45 min/lb',
    bestWood: ['apple', 'cherry', 'pecan', 'maple'],
    keyTips: [
      'Spatchcock (butterfly) for even cooking — remove the backbone',
      'Higher temp is critical: low and slow makes rubbery chicken skin',
      'Brine for 4-12 hours for juicier results',
      'Pat skin completely dry and optionally apply baking powder for crispier skin',
      'Let rest 10-15 min before carving',
    ],
  },
  {
    meat: 'turkey',
    smokerTempF: '275-325°F',
    targetInternalF: '165°F breast, 175°F thigh',
    timePerLb: '20-30 min/lb at 300°F',
    bestWood: ['cherry', 'apple', 'pecan', 'maple'],
    keyTips: [
      'Spatchcock for even cooking and shorter cook time',
      'Brine 12-24 hours (wet or dry brine)',
      'Shield the breast with foil if it\'s getting ahead of the thighs',
      'Compound butter under the skin adds flavor and moisture',
      'Dark meat takes longer — removing legs and cooking separately is an option',
    ],
  },
  {
    meat: 'salmon',
    smokerTempF: '200-225°F (low and gentle)',
    targetInternalF: '145°F (or when it flakes easily)',
    timePerLb: '45-60 min total for fillets',
    bestWood: ['alder', 'apple', 'cherry', 'maple'],
    keyTips: [
      'Cure with salt and brown sugar for 4-12 hours, then air-dry to form pellicle',
      'The pellicle (tacky surface) is essential — it catches smoke',
      'Don\'t flip — use a plank or foil',
      'White albumin on surface is normal but can be reduced by brining',
      'Done when it flakes at the thickest part',
    ],
  },
];

function formatGuide(guide: SmokingGuide): string {
  let text = `## ${guide.meat.toUpperCase()} (${guide.meat})\n`;
  text += `- **Smoker temp:** ${guide.smokerTempF}\n`;
  text += `- **Target internal:** ${guide.targetInternalF}\n`;
  text += `- **Time:** ${guide.timePerLb}\n`;
  text += `- **Best wood:** ${guide.bestWood.join(', ')}\n`;
  if (guide.wrapTemp) text += `- **Wrap at:** ${guide.wrapTemp}\n`;
  if (guide.wrapMaterial) text += `- **Wrap with:** ${guide.wrapMaterial}\n`;
  text += `- **Tips:**\n`;
  for (const tip of guide.keyTips) {
    text += `  - ${tip}\n`;
  }
  return text;
}

export const smokingGuideTool: ScaffoldTool = {
  name: 'bbq-smoking_guide',
  description: `Look up BBQ smoking guidelines for a specific meat. Returns temps, times, wood pairings, wrapping guidance, and pro tips. Available meats: brisket, pork butt, ribs, chicken, turkey, salmon. Call with no arguments to get all guides.`,
  inputSchema: {
    type: 'object',
    properties: {
      meat: { type: 'string', description: 'Meat type to look up (optional — omit for all guides)' },
    },
  },
  handler: async (input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const { meat } = (input as { meat?: string }) || {};

    // Try knowledge base first (for custom/admin-provided guides)
    if (meat) {
      const knowledge = await loadKnowledge(ctx.storage, [meat.toLowerCase().trim()]);
      if (knowledge) {
        return { content: [{ type: 'text', text: knowledge }] };
      }
    }

    // Fallback to hardcoded guides
    if (!meat) {
      const all = GUIDES.map(formatGuide).join('\n---\n\n');
      return { content: [{ type: 'text', text: all }] };
    }

    const normalized = meat.toLowerCase().trim();
    const guide = GUIDES.find(g =>
      g.meat === normalized ||
      normalized.includes(g.meat) ||
      g.meat.includes(normalized)
    );

    if (!guide) {
      const available = GUIDES.map(g => g.meat).join(', ');
      return {
        content: [{
          type: 'text',
          text: `I don't have a specific smoking guide for "${meat}". Available guides: ${available}. I can still help with general smoking advice!`,
        }],
      };
    }

    return { content: [{ type: 'text', text: formatGuide(guide) }] };
  },
};
