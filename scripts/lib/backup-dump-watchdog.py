"""Internal Linux supervisor. No connections, credentials, plaintext files or logs.

Run only via the guarded adapter. Default invocation is non-executing.
The dump's hard deadline is external to Node. Owned descendants are killed via
pidfds and reaped by this subreaper, including descendants that change sessions.
"""
import ctypes
import json
import os
import signal
import subprocess
import sys
import time
_stage = "initialization"


def capabilities():
    if sys.platform != "linux" or not hasattr(os, "pidfd_open") or not hasattr(signal, "pidfd_send_signal"):
        raise RuntimeError("unsupported")
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(36, 1, 0, 0, 0) != 0:  # PR_SET_CHILD_SUBREAPER
        raise RuntimeError("unsupported")
    fd = os.pidfd_open(os.getpid())
    try:
        signal.pidfd_send_signal(fd, 0)  # Capability check, no signal delivered.
    finally:
        os.close(fd)
    return libc


def children():
    filename = "/proc/self/task/%s/children" % os.getpid()
    if os.path.exists(filename):
        with open(filename, encoding="ascii") as f:
            return [int(p) for p in f.read().split()]
    # Some managed runtimes omit task/children. Inspect ONLY local PID parent
    # metadata, never cmdline/environ/files or process names. Same ownership rule.
    result = []
    for entry in os.scandir("/proc"):
        if not entry.name.isdecimal():
            continue
        try:
            with open("/proc/%s/status" % entry.name, encoding="ascii") as f:
                parent = next(int(s.split()[1]) for s in f if s.startswith("PPid:"))
            if parent == os.getpid():
                result.append(int(entry.name))
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            continue
    return result


def kill_owned_children():
    # Open a stable process handle, then recheck direct-child ownership before
    # signalling. Never signal a bare PID that could now name an unrelated task.
    for pid in children():
        fd = None
        try:
            fd = os.pidfd_open(pid)
            with open("/proc/%s/status" % pid, encoding="ascii") as f:
                parent = next(int(s.split()[1]) for s in f if s.startswith("PPid:"))
            if parent == os.getpid():
                signal.pidfd_send_signal(fd, signal.SIGKILL)
        except (ProcessLookupError, FileNotFoundError):
            pass
        finally:
            if fd is not None:
                os.close(fd)


def reap():
    while True:
        try:
            if os.waitpid(-1, os.WNOHANG)[0] == 0:
                break
        except ChildProcessError:
            break


def main():
    global _stage
    if sys.argv[1:] == ["--probe"]:
        capabilities()
        print(json.dumps({"linuxSubreaper": True, "pidfd": True, "externalDeadline": True,
                          "interpreter": os.readlink("/proc/self/exe")}))
        return
    if len(sys.argv) != 5 or sys.argv[1] not in ("--dump", "--synthetic-tree"):
        return  # No default execution, no arbitrary command option.
    mode, millis, parent, _nonce = sys.argv[1:]
    _stage = "arguments"
    deadline_ms = int(millis)
    if not 50 <= deadline_ms <= 120000 or int(parent) != os.getppid():
        raise RuntimeError("invalid")
    libc = capabilities()
    _stage = "parent-guard"
    # Parent death is an abort, not permission to leave a background dump.
    if libc.prctl(1, signal.SIGTERM, 0, 0, 0) != 0 or int(parent) != os.getppid():
        raise RuntimeError("parent")
    interrupted = False

    def abort(_signal, _frame):
        nonlocal interrupted
        interrupted = True

    signal.signal(signal.SIGTERM, abort)
    signal.signal(signal.SIGINT, abort)

    def child_setup():
        # Kill the root native child if this supervisor itself dies unexpectedly.
        if libc.prctl(1, signal.SIGKILL, 0, 0, 0) != 0:
            os._exit(127)

    if mode == "--dump":
        args = ["pg_dump", "--format=custom", "--no-password", "--lock-wait-timeout=5000"]
    else:
        # Fixed non-DB fixture. Grandchild escapes the process group and ignores
        # TERM, proving cleanup depends on subreaper ownership, not group alone.
        args = [sys.executable, "-I", "-S", "-c",
                "import os,signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); "
                "p=os.fork(); "
                "os.setsid() if p==0 else None; "
                "time.sleep(60)"]
    start = time.monotonic()
    _stage = "spawn"
    proc = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=sys.stdout.buffer,
                            stderr=subprocess.DEVNULL, start_new_session=True, preexec_fn=child_setup)
    root_fd = os.pidfd_open(proc.pid)
    expired = False
    root_stop_ms = None

    def deadline(_signal, _frame):
        nonlocal expired, root_stop_ms
        expired = True
        root_stop_ms = round((time.monotonic() - start) * 1000)
        try:
            # Immediate stable-handle root termination: no /proc scan lies on the
            # deadline path. Descendant reaping has its separate bounded budget.
            signal.pidfd_send_signal(root_fd, signal.SIGKILL)
        except ProcessLookupError:
            pass

    signal.signal(signal.SIGALRM, deadline)
    signal.setitimer(signal.ITIMER_REAL, max(0.000001, deadline_ms / 1000 - (time.monotonic() - start)))
    if proc.pid not in children():
        # The root has not been reaped: its process handle cannot have been reused.
        fd = os.pidfd_open(proc.pid)
        try:
            signal.pidfd_send_signal(fd, signal.SIGKILL)
        finally:
            os.close(fd)
        proc.wait(timeout=2)
        raise RuntimeError("child-metadata-unavailable")
    _stage = "wait"
    while proc.poll() is None:
        remaining = deadline_ms / 1000 - (time.monotonic() - start)
        if remaining <= 0 or interrupted:
            if remaining <= 0 and not expired:
                deadline(signal.SIGALRM, None)
            break
        time.sleep(min(0.01, remaining))
    root_code = proc.poll()
    signal.setitimer(signal.ITIMER_REAL, 0)
    if interrupted and root_code is None:
        try:
            signal.pidfd_send_signal(root_fd, signal.SIGKILL)
        except ProcessLookupError:
            pass
    # This bounded cleanup also runs on normal exit: a successful root must not
    # leave orphan helpers. Killing parents adopts escaped descendants here.
    cleanup_until = time.monotonic() + 2
    _stage = "tree-cleanup"
    while children() and time.monotonic() < cleanup_until:
        kill_owned_children()
        # Let Popen reap its own root before generic adopted-child reaping.
        proc.poll()
        reap()
        time.sleep(0.01)
    empty = not children() and proc.poll() is not None
    root_code = proc.returncode
    os.close(root_fd)
    result = {"deadlineExpired": expired, "aborted": interrupted,
              "rootExitCode": root_code, "treeEmpty": empty,
              "rootSignal": -root_code if root_code is not None and root_code < 0 else None,
              "rootTerminationRequestedMs": root_stop_ms,
              "elapsedMs": round((time.monotonic() - start) * 1000),
              "serverQueryTimeoutEnforced": False}
    os.write(3, json.dumps(result, separators=(",", ":")).encode("ascii"))


if __name__ == "__main__":
    try:
        main()
    except BaseException as error:
        # Never emit a traceback, environment, argv, provider error or native stderr.
        try:
            until = time.monotonic() + 2
            while children() and time.monotonic() < until:
                kill_owned_children()
                reap()
                time.sleep(0.01)
        except BaseException:
            pass
        try:
            os.write(3, json.dumps({"failureClass": type(error).__name__, "stage": _stage}).encode("ascii"))
        except BaseException:
            pass
        os._exit(2)
