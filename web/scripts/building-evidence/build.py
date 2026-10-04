"""Regenerate #68's investigation plans against current I2/I3, without modifying either."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
import planner
sys.argv = ['planner', '--output', str(ROOT / 'build/building-evidence-plans.json')]
planner.main()
