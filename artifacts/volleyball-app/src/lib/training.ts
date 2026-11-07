import type { StatLine } from "@workspace/api-client-react";
import {
  digSuccessRate,
  errorRate,
  hittingEfficiency,
  passingAverage,
  serveSuccessRate,
  totalDigs,
  totalPasses,
  totalServes,
} from "./analytics";

export type Recommendation = {
  area: string;
  finding: string;
  work: string;
  /** Higher runs first. Weakest area with enough data to trust it wins. */
  priority: number;
};

/**
 * Turn a stat line into things to actually work on.
 *
 * Rules, not a model. Each one names the number that triggered it so a coach
 * can disagree with the reasoning rather than being handed a verdict. Nothing
 * fires without enough attempts behind it, because telling a player to fix
 * their passing off three receptions is noise.
 */
export function trainingRecommendations(stats: StatLine): Recommendation[] {
  const out: Recommendation[] = [];

  const eff = hittingEfficiency(stats);
  const errors = errorRate(stats);
  if (eff !== null && stats.hittingAttempts >= 8) {
    if (eff < 0) {
      out.push({
        area: "Hitting",
        finding: `Efficiency is ${eff.toFixed(3)}, so swings are costing points on balance.`,
        work: "Shot selection over power. Hit line and cut shots at controlled speed until the ball lands in, then add pace back.",
        priority: 100,
      });
    } else if (errors !== null && errors > 0.35) {
      out.push({
        area: "Hitting",
        finding: `${Math.round(errors * 100)}% of attempts end in an error or go out.`,
        work: "Approach timing and contact point. Tripod drills off a set toss, then live sets once the ball is consistently in front of the hitting shoulder.",
        priority: 80,
      });
    } else if (eff >= 0.25) {
      out.push({
        area: "Hitting",
        finding: `Efficiency of ${eff.toFixed(3)} is a genuine strength.`,
        work: "Add a second shot. Tool the block and roll shots deep so defences cannot sit on the line.",
        priority: 20,
      });
    }
  }

  const pass = passingAverage(stats);
  if (pass !== null && totalPasses(stats) >= 8) {
    if (pass < 1.8) {
      out.push({
        area: "Passing",
        finding: `Passing average of ${pass.toFixed(2)} is leaving the setter out of system.`,
        work: "Platform angle and early movement. Butterfly passing to a target, feet set before contact, no swinging arms.",
        priority: 90,
      });
    } else if (pass >= 2.4) {
      out.push({
        area: "Passing",
        finding: `Passing average of ${pass.toFixed(2)} is reliable enough to build the offence around.`,
        work: "Take more court. Extend the seam responsibility and practise passing tough jump serves.",
        priority: 15,
      });
    }
  }

  const serve = serveSuccessRate(stats);
  if (serve !== null && totalServes(stats) >= 6) {
    if (serve < 0.8) {
      out.push({
        area: "Serving",
        finding: `Only ${Math.round(serve * 100)}% of serves are landing in.`,
        work: "Consistent toss before anything else. Same toss, same contact, target deep middle, and only add pace once the miss rate drops.",
        priority: 95,
      });
    } else if (stats.aces / Math.max(1, totalServes(stats)) > 0.2) {
      out.push({
        area: "Serving",
        finding: "Serve is already generating free points.",
        work: "Serve to zones. Target the weakest passer and the seams rather than serving harder.",
        priority: 10,
      });
    }
  }

  const dig = digSuccessRate(stats);
  if (dig !== null && totalDigs(stats) >= 6 && dig < 0.5) {
    out.push({
      area: "Defence",
      finding: `Just over ${Math.round(dig * 100)}% of dig attempts are staying up.`,
      work: "Low base position and read the hitter's shoulder, not the ball. Wall digs and coach-on-a-box tips.",
      priority: 70,
    });
  }

  if (stats.blockingErrors > stats.blocks && stats.blocks + stats.blockingErrors >= 4) {
    out.push({
      area: "Blocking",
      finding: "More blocking errors than blocks so far.",
      work: "Press over the net rather than reaching up. Footwork drills for a square landing and no net contact.",
      priority: 60,
    });
  }

  return out.sort((a, b) => b.priority - a.priority);
}
