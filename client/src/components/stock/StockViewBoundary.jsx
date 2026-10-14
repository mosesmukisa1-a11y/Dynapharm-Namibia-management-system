import React, { Component } from 'react';
import { STOCK_READ_ERROR } from '../../lib/stockReadErrors';

// A failing view must not leave a usable-looking shell with no explanation.
export default class StockViewBoundary extends Component {
  state = { error: null, retry:0 };
  onReadError = event => {
    if (event.detail.context !== window.location.pathname+window.location.search) return;
    this.setState({error:new Error(`${event.detail.endpoint}${event.detail.status ? ` (${event.detail.status})` : ''}: ${event.detail.message}`)});
  };
  componentDidMount(){window.addEventListener(STOCK_READ_ERROR,this.onReadError);}
  componentWillUnmount(){window.removeEventListener(STOCK_READ_ERROR,this.onReadError);}
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('Stock view failed:', this.props.view, error); }
  render() {
    if (this.state.error) return <section role="alert" className="sp-panel sp-panel-content">
      <h2>Could not display {this.props.view}</h2>
      <p>{this.state.error.message || 'Unexpected view error.'}</p>
      <button className="sp-btn" onClick={() => this.setState(previous=>({ error: null,retry:previous.retry+1 }))}>Retry view</button>
    </section>;
    return <div key={this.state.retry}>{this.props.children}</div>;
  }
}
