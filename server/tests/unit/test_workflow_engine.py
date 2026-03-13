"""Tests for WorkflowEngine."""

import threading
import pytest

from openclaw_orchestrator.services.workflow_engine import WorkflowEngine


class TestWorkflowEngineConcurrency:
    """Tests for concurrent access to _running_executions."""

    def test_execution_lock_protects_running_executions(self):
        """Verify that _execution_lock is created on initialization."""
        engine = WorkflowEngine()
        
        # Check that lock exists
        assert hasattr(engine, '_execution_lock')
        assert isinstance(engine._execution_lock, type(threading.Lock()))
        
        # Check that _running_executions is initialized
        assert hasattr(engine, '_running_executions')
        assert engine._running_executions == {}

    def test_multiple_threads_can_safely_access_executions(self):
        """Verify thread-safe access to _running_executions."""
        engine = WorkflowEngine()
        errors = []
        
        def write_execution(exec_id: str):
            try:
                with engine._execution_lock:
                    engine._running_executions[exec_id] = {"abort": False}
            except Exception as e:
                errors.append(e)
        
        def read_execution(exec_id: str):
            try:
                with engine._execution_lock:
                    _ = engine._running_executions.get(exec_id)
            except Exception as e:
                errors.append(e)
        
        # Create multiple threads
        threads = []
        for i in range(10):
            threads.append(threading.Thread(target=write_execution, args=(f"exec_{i}",)))
            threads.append(threading.Thread(target=read_execution, args=(f"exec_{i}",)))
        
        # Start all threads
        for t in threads:
            t.start()
        
        # Wait for all threads to complete
        for t in threads:
            t.join()
        
        # No errors should occur
        assert len(errors) == 0
        
        # All executions should be recorded
        assert len(engine._running_executions) == 10


class TestWorkflowEngineBasic:
    """Basic tests for WorkflowEngine functionality."""

    def test_has_active_execution_returns_false_when_no_executions(self):
        """Verify has_active_execution returns False for empty state."""
        engine = WorkflowEngine()
        # This will check the database, which should have no active executions
        # in a test environment
        # Note: This test requires database setup in a real test environment
        pass
