import json
import os
import tempfile
import unittest
from pathlib import Path

from app import clean_text, fit_elements, frame, reflow_overlapping_nodes, speech, valid_lesson


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = json.loads((ROOT / "fixtures" / "orbits.json").read_text(encoding="utf8"))


class WorkerTests(unittest.TestCase):
    def test_valid_lesson_has_bounded_scenes(self):
        self.assertTrue(valid_lesson(FIXTURE))
        invalid = dict(FIXTURE, scenes=[])
        self.assertFalse(valid_lesson(invalid))

    def test_compact_geometry_expands_without_changing_ids(self):
        elements = [{"id":"a","type":"circle","x":45,"y":50,"radius":3},
                    {"id":"b","type":"line","x":45,"y":50,"width":8,"height":0}]
        fitted = fit_elements(elements)
        self.assertEqual([e["id"] for e in fitted], ["a","b"])
        self.assertGreater(fitted[1]["width"], 8)

    def test_overlapping_labeled_boxes_become_readable_flow(self):
        boxes=[
            {"id":"first","type":"rect","x":20,"y":20,"width":50,"height":35,"text":"first"},
            {"id":"second","type":"rect","x":30,"y":45,"width":40,"height":30,"text":"second"},
            {"id":"third","type":"rect","x":40,"y":65,"width":30,"height":25,"text":"third"},
        ]
        result,flow=reflow_overlapping_nodes(boxes)
        self.assertEqual(len(flow),3)
        self.assertLess(result[0]["x"]+result[0]["width"],result[1]["x"])
        self.assertEqual([e["text"] for e in flow],["first","second","third"])

    def test_every_fixture_scene_draws_a_frame(self):
        for index, scene in enumerate(FIXTURE["scenes"]):
            image = frame(scene,FIXTURE["title"],index,len(FIXTURE["scenes"]),5,12)
            self.assertEqual(image.size,(1280,720))

    def test_no_scene_progress_line_in_video_pixels(self):
        scene=FIXTURE["scenes"][0]
        early=frame(scene,FIXTURE["title"],0,3,1,15)
        late=frame(scene,FIXTURE["title"],0,3,14,15)
        self.assertEqual(early.crop((0,710,1280,720)).tobytes(),late.crop((0,710,1280,720)).tobytes())

    def test_nonbreaking_hyphens_render_as_readable_text(self):
        self.assertEqual(clean_text("self‑calls and n−1"), "self-calls and n-1")

    @unittest.skipUnless(os.environ.get("SIMI_PIPER_MODEL"), "Offline neural model not configured")
    def test_unicode_narration_uses_utf8(self):
        with tempfile.TemporaryDirectory() as folder:
            output=Path(folder)/"voice.wav"
            speech("A non-breaking hyphen ‑ and a degree 42°.",output,0,1.0)
            self.assertGreater(output.stat().st_size,1000)


if __name__=="__main__":
    unittest.main()
