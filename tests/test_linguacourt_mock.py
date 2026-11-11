"""Mock tests for contracts/linguacourt.py.

Local unit tests with a stubbed `genlayer` module. They simulate the
state machine, sender-bound roles, deterministic settlement math and the
mocked consensus (leader + validator agreement via run_nondet_unsafe).
They are NOT on-chain consensus results; real verification happens on
Stable Studionet. Run: python3 -m pytest tests/test_linguacourt_mock.py -q
"""
import importlib.util
import json
import os
import sys
import types
import unittest

CLIENT = '0x' + 'a' * 40
TRANSLATOR = '0x' + 'b' * 40
OUTSIDER = '0x' + '9' * 40
FEE = 10000000000000000000


class E(Exception):
    pass


class Return:
    def __init__(self, x):
        self.calldata = x


class Store(dict):
    @classmethod
    def __class_getitem__(cls, x):
        return cls


def _w(f):
    return f


_w.payable = _w


class _Msg(types.SimpleNamespace):
    pass


MSG = _Msg(sender_address=CLIENT, value=0)


def _exec_prompt(prompt, response_format=None):
    # Canned judge: decide from the INPUT embedded in the prompt.
    if 'Veuillez arroser' in prompt:
        return json.dumps({'verdict': 'REJECT',
                           'reason': 'The translation is in French, not the requested German, so it cannot be used.'})
    if '52 euros' in prompt:
        return json.dumps({'verdict': 'PARTIAL',
                           'reason': 'The translation is mostly faithful but the ticket price is wrong, 52 euros instead of 25.'})
    return json.dumps({'verdict': 'ACCEPT',
                       'reason': 'The translation is faithful, complete and in the requested language with no material error.'})


def _run_nondet(leader_fn, validator_fn):
    return leader_fn()


def _iface(cls):
    class Dummy:
        def __init__(self, addr):
            self.addr = addr

        def emit_transfer(self, value=None):
            return None

    return Dummy


G = types.SimpleNamespace(
    Contract=object,
    public=types.SimpleNamespace(write=_w, view=lambda f: f),
    evm=types.SimpleNamespace(contract_interface=_iface),
    message=MSG,
    vm=types.SimpleNamespace(UserError=E, Return=Return,
                             run_nondet_unsafe=_run_nondet),
    nondet=types.SimpleNamespace(exec_prompt=_exec_prompt),
)
fake = types.ModuleType('genlayer')
fake.__all__ = ['gl', 'TreeMap', 'u32', 'u256', 'Address']
fake.gl = G
fake.TreeMap = Store
fake.u32 = int
fake.u256 = int
fake.Address = lambda s: s
sys.modules['genlayer'] = fake

_spec = importlib.util.spec_from_file_location(
    'linguacourt', os.path.join(os.path.dirname(__file__), '..',
                                'contracts', 'linguacourt.py'))
m = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m)


def fresh():
    c = m.LinguaCourt()
    c.__init__()
    return c


def as_user(addr, value=0):
    MSG.sender_address = addr
    MSG.value = value


SRC1 = "The museum opens at nine in the morning and closes at six in the evening. Admission is free on Sundays."
TR1 = "El museo abre a las nueve de la mañana y cierra a las seis de la tarde. La entrada es gratuita los domingos."
SRC2 = "The train leaves Paris at 8:15 and arrives in Lyon at 10:30. A standard ticket costs 25 euros."
TR2 = "Le train part de Paris à 8h15 et arrive à Lyon à 10h30. Un billet standard coûte 52 euros."
SRC3 = "Please water the plants twice a week and keep the cat indoors at night."
TR3 = "Veuillez arroser les plantes deux fois par semaine et garder le chat à l'intérieur la nuit."


class TestLinguaCourt(unittest.TestCase):
    def test_create_wrong_fee(self):
        c = fresh()
        as_user(CLIENT, 1)
        with self.assertRaises(E):
            c.create_case(SRC1, 'Spanish', 'Museum hours')
        self.assertEqual(json.loads(c.get_all_cases()), [])

    def test_create_ok(self):
        c = fresh()
        as_user(CLIENT, FEE)
        out = json.loads(c.create_case(SRC1, 'Spanish', 'Museum hours'))
        self.assertEqual(out['case_id'], 1)
        self.assertEqual(out['status'], 'OPEN')
        self.assertEqual(int(c.total_received), FEE)

    def test_create_bad_lang(self):
        c = fresh()
        as_user(CLIENT, FEE)
        with self.assertRaises(E):
            c.create_case(SRC1, 'Klingon', '')

    def test_client_cannot_translate_own(self):
        c = fresh()
        as_user(CLIENT, FEE)
        c.create_case(SRC1, 'Spanish', '')
        as_user(CLIENT)
        with self.assertRaises(E):
            c.submit_translation(1, TR1)

    def test_copy_is_rejected_at_submit(self):
        c = fresh()
        as_user(CLIENT, FEE)
        c.create_case(SRC1, 'Spanish', '')
        as_user(TRANSLATOR)
        with self.assertRaises(E):
            c.submit_translation(1, SRC1)

    def test_accept_flow_settles_100_translator(self):
        c = fresh()
        as_user(CLIENT, FEE)
        c.create_case(SRC1, 'Spanish', '')
        as_user(TRANSLATOR)
        c.submit_translation(1, TR1)
        with self.assertRaises(E):  # duplicate submission
            c.submit_translation(1, TR1)
        as_user(OUTSIDER)
        with self.assertRaises(E):  # non-client accept
            c.accept_case(1)
        as_user(CLIENT)
        out = json.loads(c.accept_case(1))
        self.assertEqual(out['status'], 'SETTLED_ACCEPT')
        self.assertEqual(out['translator_credit'], FEE)
        self.assertEqual(out['client_credit'], 0)
        as_user(TRANSLATOR)
        w = json.loads(c.withdraw(1))
        self.assertEqual(w['withdrawn_wei'], FEE)
        with self.assertRaises(E):  # double withdraw
            c.withdraw(1)
        as_user(CLIENT)
        with self.assertRaises(E):  # client has no credit on ACCEPT
            c.withdraw(1)

    def test_dispute_partial_splits_50_50(self):
        c = fresh()
        as_user(CLIENT, FEE)
        c.create_case(SRC2, 'French', '')
        as_user(TRANSLATOR)
        c.submit_translation(1, TR2)
        as_user(CLIENT)
        out = json.loads(c.dispute_case(1))
        self.assertEqual(out['status'], 'SETTLED_PARTIAL')
        self.assertEqual(out['verdict'], 'PARTIAL')
        self.assertEqual(out['translator_credit'], FEE // 2)
        self.assertEqual(out['client_credit'], FEE // 2)

    def test_dispute_reject_refunds_client(self):
        c = fresh()
        as_user(CLIENT, FEE)
        c.create_case(SRC3, 'German', '')
        as_user(TRANSLATOR)
        c.submit_translation(1, TR3)
        as_user(OUTSIDER)
        with self.assertRaises(E):  # non-client dispute
            c.dispute_case(1)
        as_user(CLIENT)
        out = json.loads(c.dispute_case(1))
        self.assertEqual(out['status'], 'SETTLED_REJECT')
        self.assertEqual(out['translator_credit'], 0)
        self.assertEqual(out['client_credit'], FEE)

    def test_judge_validation(self):
        self.assertEqual(m._validate_judgement(
            {'verdict': 'ACCEPT', 'reason': 'Faithful and complete translation.'})['verdict'], 'ACCEPT')
        with self.assertRaises(E):
            m._validate_judgement({'verdict': 'MAYBE', 'reason': 'x' * 20})
        with self.assertRaises(E):  # direction: ACCEPT + wrong-language reason
            m._validate_judgement({'verdict': 'ACCEPT',
                                   'reason': 'Good but in the wrong language entirely, unusable here.'})
        with self.assertRaises(E):  # reason too short
            m._validate_judgement({'verdict': 'REJECT', 'reason': 'Bad.'})


if __name__ == '__main__':
    unittest.main()
