import signal
import socket
import time
import unittest
from backup_readonly_v2 import read_deadline


@unittest.skipUnless(hasattr(signal,'setitimer'),'Unix deadline required')
class ReadDeadlineTests(unittest.TestCase):
    def test_blocked_socket_is_interrupted_and_alarm_is_cleaned_up(self):
        left,right=socket.socketpair()
        self.addCleanup(left.close);self.addCleanup(right.close)
        previous=signal.getsignal(signal.SIGALRM)
        started=time.monotonic()
        with self.assertRaises(TimeoutError):
            with read_deadline(0.03):left.recv(1)
        self.assertLess(time.monotonic()-started,1)
        self.assertEqual(signal.getitimer(signal.ITIMER_REAL)[0],0)
        self.assertEqual(signal.getsignal(signal.SIGALRM),previous)
    def test_existing_timer_is_never_silently_replaced(self):
        signal.setitimer(signal.ITIMER_REAL,10)
        try:
            with self.assertRaises(RuntimeError):
                with read_deadline():pass
            self.assertGreater(signal.getitimer(signal.ITIMER_REAL)[0],9)
        finally:signal.setitimer(signal.ITIMER_REAL,0)


if __name__=='__main__':unittest.main()
